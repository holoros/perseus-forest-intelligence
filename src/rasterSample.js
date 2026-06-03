// Client-side raster sampling for AOI summaries. Decodes a CONUS overlay PNG to
// a canvas once (cached), maps an AOI lon/lat box to pixel space using the same
// Albers frame the overlays are placed in, and returns categorical composition
// or ramp-inverted values for pixels inside the box. This lets the AOI report
// pull landowner / risk / forest-cover for ANY CONUS location, not just the six
// FIA-plot states.
import { project, projectInverse, pointInGeometry } from "./geo.js";

const EARTH_R = 6378137;
const _cache = {};   // url -> Promise<{data,w,h}>

function loadRaster(url){
  if(_cache[url]) return _cache[url];
  _cache[url] = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try{
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, cv.width, cv.height);
        resolve({ data: id.data, w: cv.width, h: cv.height });
      }catch(e){ reject(e); }
    };
    img.onerror = reject;
    img.src = url;
  });
  return _cache[url];
}

function lonLatToPixel(lon, lat, b, w, h){
  const [rx, ry] = project(lon, lat);   // unit-sphere radians (Albers, lat_0 37.5)
  const mx = rx * EARTH_R, my = ry * EARTH_R;
  const px = (mx - b.x0) / (b.x1 - b.x0) * w;
  const py = (b.y1 - my) / (b.y1 - b.y0) * h;
  return [px, py];
}
function pixelToLonLat(x, y, b, w, h){
  const mx = b.x0 + (x / w) * (b.x1 - b.x0), my = b.y1 - (y / h) * (b.y1 - b.y0);
  return projectInverse(mx / EARTH_R, my / EARTH_R);
}
function geomBBox(geom){
  let lo0=Infinity, la0=Infinity, lo1=-Infinity, la1=-Infinity;
  const scan = ring => ring.forEach(([lo,la]) => { if(lo<lo0)lo0=lo; if(lo>lo1)lo1=lo; if(la<la0)la0=la; if(la>la1)la1=la; });
  if(geom.type === "Polygon") geom.coordinates.forEach(scan);
  else if(geom.type === "MultiPolygon") geom.coordinates.forEach(p => p.forEach(scan));
  return [lo0, la0, lo1, la1];
}

// Sample opaque pixels inside an AOI geometry (box or state/ecoregion polygon).
// Pixels are masked to the polygon, so `total` counts in-polygon pixels only
// (forest fraction = forest / polygon area). Returns { px:[[r,g,b],...], total }.
async function samplePixels(url, bounds, geom, target = 1600){
  const { data, w, h } = await loadRaster(url);
  const [lon0, lat0, lon1, lat1] = geomBBox(geom);
  const c1 = lonLatToPixel(lon0, lat1, bounds, w, h);
  const c2 = lonLatToPixel(lon1, lat0, bounds, w, h);
  let x0 = Math.max(0, Math.floor(Math.min(c1[0], c2[0])));
  let x1 = Math.min(w - 1, Math.ceil(Math.max(c1[0], c2[0])));
  let y0 = Math.max(0, Math.floor(Math.min(c1[1], c2[1])));
  let y1 = Math.min(h - 1, Math.ceil(Math.max(c1[1], c2[1])));
  if(x1 < x0 || y1 < y0) return { px: [], total: 0 };
  const cells = (x1 - x0 + 1) * (y1 - y0 + 1);
  const step = Math.max(1, Math.floor(Math.sqrt(cells / target)));
  const px = []; let total = 0;
  for(let y = y0; y <= y1; y += step){
    for(let x = x0; x <= x1; x += step){
      const [lon, lat] = pixelToLonLat(x, y, bounds, w, h);
      if(!pointInGeometry(lon, lat, geom)) continue;   // mask to the polygon
      total++;
      const i = (y * w + x) * 4;
      if(data[i + 3] < 24) continue;       // transparent = non-forest / no-data
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return { px, total };
}

const dist2 = (a, b) => { const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2]; return dr*dr+dg*dg+db*db; };
const hex2rgb = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];

// Landowner composition by nearest categorical color (works for any CONUS AOI).
const OWN_CLASSES = [
  ["Private (Family/Corporate)", "#3fb68b"], ["Private (Family/Corporate)", "#e6ab02"],
  ["Tribal", "#8c510a"], ["Other Federal", "#3C5488"],
  ["State / Local", "#6baed6"], ["State / Local", "#80cdc1"],
];
export async function ownershipComposition(url, bounds, geom){
  const { px } = await samplePixels(url, bounds, geom);
  if(!px.length) return null;
  const refs = OWN_CLASSES.map(([lab, hex]) => [lab, hex2rgb(hex)]);
  const counts = {};
  for(const p of px){
    let best = null, bd = Infinity;
    for(const [lab, rgb] of refs){ const d = dist2(p, rgb); if(d < bd){ bd = d; best = lab; } }
    if(bd > 9000) continue;   // not an ownership color (edge/antialias)
    counts[best] = (counts[best] || 0) + 1;
  }
  const tot = Object.values(counts).reduce((a, b) => a + b, 0);
  if(!tot) return null;
  return Object.entries(counts).map(([label, n]) => ({ label, n, pct: 100 * n / tot }))
    .sort((a, b) => b.pct - a.pct);
}

// Invert the disturbance color ramp to a probability, then summarize.
const DIST_RAMP = [
  [0.00,[255,255,204]],[0.03,[255,255,178]],[0.10,[254,217,118]],
  [0.20,[254,178,76]],[0.32,[253,141,60]],[0.45,[240,59,32]],[0.72,[189,0,38]],
];
function buildLUT(ramp, steps = 96){
  const lut = [];
  const v0 = ramp[0][0], v1 = ramp[ramp.length-1][0];
  for(let i = 0; i <= steps; i++){
    const v = v0 + (v1 - v0) * i / steps;
    let k = 0; while(k < ramp.length-2 && v > ramp[k+1][0]) k++;
    const [va, ca] = ramp[k], [vb, cb] = ramp[k+1];
    const t = (v - va) / ((vb - va) || 1);
    lut.push([v, [0,1,2].map(j => ca[j] + t*(cb[j]-ca[j]))]);
  }
  return lut;
}
const DIST_LUT = buildLUT(DIST_RAMP);
export async function riskSummary(url, bounds, geom){
  const { px } = await samplePixels(url, bounds, geom);
  if(!px.length) return null;
  let sum = 0, n = 0, lo = 0, mod = 0, hi = 0;
  for(const p of px){
    let best = 0, bd = Infinity;
    for(const [v, c] of DIST_LUT){ const d = dist2(p, c); if(d < bd){ bd = d; best = v; } }
    if(bd > 12000) continue;
    sum += best; n++;
    if(best < 0.20) lo++; else if(best < 0.45) mod++; else hi++;
  }
  if(!n) return null;
  const mean = sum / n;
  const band = mean < 0.20 ? "Low" : mean < 0.40 ? "Moderate" : "High";
  return { mean, band, lo: 100*lo/n, mod: 100*mod/n, hi: 100*hi/n };
}

// Generic relative position along a sequential ramp (0..1) for the AOI box.
// For each opaque pixel, find the nearest ramp stop; its index / (n-1) is its
// relative level. Returns { rel, band } with no unit assumptions — works for any
// ramp layer (CSPI, SVI, standing value, ...).
export async function rampRelative(url, bounds, geom, rampHexes){
  const { px } = await samplePixels(url, bounds, geom);
  if(!px.length) return null;
  const stops = rampHexes.map(hex2rgb);
  let sum = 0, n = 0;
  for(const p of px){
    let bi = 0, bd = Infinity;
    for(let i = 0; i < stops.length; i++){ const d = dist2(p, stops[i]); if(d < bd){ bd = d; bi = i; } }
    if(bd > 16000) continue;              // not a ramp color (edge/other layer)
    sum += bi / (stops.length - 1); n++;
  }
  if(!n) return null;
  const rel = sum / n;
  const band = rel < 0.34 ? "Low" : rel < 0.67 ? "Moderate" : "High";
  return { rel, band };
}

// Build a fine continuous LUT (default 64 steps) interpolating a ramp's hex
// stops, so matched values are continuous 0..1 (not just the few stop levels).
function rampLUT(hexes, steps = 64){
  const stops = hexes.map(hex2rgb), lut = [];
  for(let i = 0; i <= steps; i++){
    const t = i / steps * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t)), f = t - k;
    lut.push([[0,1,2].map(j => stops[k][j] + f * (stops[k+1][j] - stops[k][j])), i / steps]);
  }
  return lut;
}
// Sorted array of per-pixel relative positions (continuous 0..1) along a ramp for
// a geom. Used to build a region distribution and rank an AOI within it.
export async function rampValues(url, bounds, geom, rampHexes){
  const { px } = await samplePixels(url, bounds, geom);
  if(!px.length) return null;
  const lut = rampLUT(rampHexes);
  const out = [];
  for(const p of px){
    let bv = 0, bd = Infinity;
    for(const [c, v] of lut){ const d = dist2(p, c); if(d < bd){ bd = d; bv = v; } }
    if(bd > 14000) continue;
    out.push(bv);
  }
  return out.length ? out.sort((a, b) => a - b) : null;
}
// Median of a numeric array (assumes finite values).
export function median(arr){
  if(!arr || !arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// Percentile (0..1) of value within a sorted distribution.
export function percentile(value, sortedDist){
  if(value == null || !sortedDist || !sortedDist.length) return null;
  let lo = 0; for(const x of sortedDist) if(x <= value) lo++;
  return lo / sortedDist.length;
}

// Forest cover fraction in the box (opaque forest pixels / all box pixels).
export async function forestFraction(url, bounds, geom){
  const { px, total } = await samplePixels(url, bounds, ring);
  if(!total) return null;
  return px.length / total;   // forest pixels are the opaque ones
}

// Forest-type diversity (Shannon evenness) from the fortype raster -> a
// transparent biodiversity proxy. Returns { evenness 0..1, richness }.
const FORTYPE_COLORS = [
  ["Softwood","#00A087"], ["Mixedwood","#3C5488"], ["Hardwood","#E64B35"],
];
export async function forestTypeDiversity(url, bounds, geom){
  const { px } = await samplePixels(url, bounds, geom);
  if(!px.length) return null;
  const refs = FORTYPE_COLORS.map(([lab,hex]) => [lab, hex2rgb(hex)]);
  const counts = {};
  for(const p of px){
    let best=null, bd=Infinity;
    for(const [lab,rgb] of refs){ const d=dist2(p,rgb); if(d<bd){bd=d;best=lab;} }
    if(bd > 12000) continue;
    counts[best] = (counts[best]||0)+1;
  }
  const vals = Object.values(counts), tot = vals.reduce((a,b)=>a+b,0);
  if(!tot) return null;
  const richness = vals.filter(v=>v>0).length;
  let H = 0; for(const v of vals){ const pi = v/tot; if(pi>0) H -= pi*Math.log(pi); }
  const evenness = richness > 1 ? H / Math.log(richness) : 0;
  return { evenness, richness };
}
