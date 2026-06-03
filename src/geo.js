// Shared geometry for the SVG map: US Albers forward + inverse projection,
// point-in-polygon, feature lookup, centroid, and the L3 yield helper.
// Dependency-free. The forward projection matches the one SVGMap has always
// used (NAD83 CONUS Albers on a unit sphere); SVGMap now imports it from here.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
// lat_0 = 37.5° to match the ESRI:102003 frame that all CONUS rasters are warped
// to (was 38°, which left overlays ~7.5px off and inspect-inverse slightly off).
export const PHI0 = 37.5 * D2R;
const PHI1 = 29.5 * D2R, PHI2 = 45.5 * D2R;
export const LAM0 = -96 * D2R;
export const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
export const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
export const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

// lon/lat (deg) -> projected [x, y] on the unit sphere (math y north-positive)
export function project(lon, lat){
  const phi = lat * D2R, lam = lon * D2R;
  const rho = Math.sqrt(Math.max(0, C - 2 * N * Math.sin(phi))) / N;
  const theta = N * (lam - LAM0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

// inverse: projected [x, y] -> lon/lat (deg)
export function projectInverse(x, y){
  const ry = RHO0 - y;
  const rho = Math.sign(N) * Math.sqrt(x * x + ry * ry);
  const theta = Math.atan2(x, ry);
  const s = (C - (rho * N) ** 2) / (2 * N);
  const phi = Math.asin(Math.max(-1, Math.min(1, s)));
  const lam = LAM0 + theta / N;
  return [lam * R2D, phi * R2D];
}

// ray-casting point-in-ring (ring = array of [lon,lat]); robust to winding
export function pointInRing(lon, lat, ring){
  let inside = false;
  for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

// Polygon = [outerRing, hole1, ...]; inside outer and outside all holes
function pointInPolygon(lon, lat, poly){
  if(!poly.length || !pointInRing(lon, lat, poly[0])) return false;
  for(let h = 1; h < poly.length; h++) if(pointInRing(lon, lat, poly[h])) return false;
  return true;
}

// geometry may be Polygon or MultiPolygon
export function pointInGeometry(lon, lat, geom){
  if(!geom) return false;
  if(geom.type === "Polygon") return pointInPolygon(lon, lat, geom.coordinates);
  if(geom.type === "MultiPolygon") return geom.coordinates.some(p => pointInPolygon(lon, lat, p));
  return false;
}

// first feature whose geometry contains the point (with a cheap bbox prefilter)
export function findFeature(features, lon, lat){
  for(const f of (features || [])){
    const bb = f.__bbox || (f.__bbox = bbox(f.geometry));
    if(bb && (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3])) continue;
    if(pointInGeometry(lon, lat, f.geometry)) return f;
  }
  return null;
}

function bbox(geom){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const scan = ring => ring.forEach(([x, y]) => {
    if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y;
  });
  if(!geom) return null;
  if(geom.type === "Polygon") geom.coordinates.forEach(scan);
  else if(geom.type === "MultiPolygon") geom.coordinates.forEach(p => p.forEach(scan));
  else return null;
  return [x0, y0, x1, y1];
}

// area-weighted centroid of the largest outer ring of a (Multi)Polygon
export function polygonCentroid(geom){
  let rings = [];
  if(geom.type === "Polygon") rings = [geom.coordinates[0]];
  else if(geom.type === "MultiPolygon") rings = geom.coordinates.map(p => p[0]);
  let best = null, bestAbs = -1;
  for(const ring of rings){
    if(!ring || ring.length < 3) continue;
    let a = 0, cx = 0, cy = 0;
    for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    a *= 0.5;
    if(Math.abs(a) > bestAbs){ bestAbs = Math.abs(a); best = a ? [cx/(6*a), cy/(6*a)] : ring[0]; }
  }
  return best;
}

// Polygon area in m^2. The Albers projection here is EQUAL-AREA, so the
// shoelace area of the projected (unit-sphere) ring, times Earth radius^2, is
// the true ground area. Subtracts holes.
const EARTH_R_AREA = 6378137;
function ringAreaProj(ring){
  let a = 0;
  for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const [x1, y1] = project(ring[j][0], ring[j][1]);
    const [x2, y2] = project(ring[i][0], ring[i][1]);
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}
export function polygonAreaM2(geom){
  if(!geom) return 0;
  const polys = geom.type === "Polygon" ? [geom.coordinates]
    : geom.type === "MultiPolygon" ? geom.coordinates : [];
  let total = 0;
  for(const poly of polys)
    for(let r = 0; r < poly.length; r++)
      total += (r === 0 ? 1 : -1) * ringAreaProj(poly[r]);
  return Math.abs(total) * EARTH_R_AREA * EARTH_R_AREA;
}

// AGB (ton/ac) at a given age from a yield_curves_by_l3 entry
export function agbAtAge(l3entry, age = 50, treatment = "untreated"){
  const c = l3entry && l3entry.curves && l3entry.curves.agb_tonac && l3entry.curves.agb_tonac[treatment];
  if(!c) return null;
  const hit = c.find(([a]) => a === age);
  return hit ? hit[1] : null;
}
