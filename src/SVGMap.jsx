// SVG choropleth — pure dependency-free, no WebGL. Hand-rolled US Albers projection.
// Renders the CONUS states as an SVG so the coverage/carbon map always works,
// regardless of maplibre / WebGL availability.
import { useEffect, useRef, useState } from "react";
import { projectInverse } from "./geo.js";

const W = 640, H = 400;
const PAD = 8;
// Earth radius (m) for converting projected Albers meters <-> our unit-sphere
// projection output (which is in radians). gdalwarp emits bounds in m so the
// CONUS overlay placement needs this conversion.
const EARTH_R = 6378137;
// US Albers parameters. lat_0 MUST match the raster warp target (ESRI:102003,
// USA Contiguous Albers) whose lat_0 = 37.5°. A prior 38° value shifted every
// CONUS raster overlay ~12px south of the state polygons; 37.5° aligns them.
const PHI0 = 37.5 * Math.PI / 180;
const PHI1 = 29.5 * Math.PI / 180;
const PHI2 = 45.5 * Math.PI / 180;
const LAM0 = -96 * Math.PI / 180;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

function project(lon, lat){
  const phi = lat * Math.PI / 180;
  const lam = lon * Math.PI / 180;
  const rho = Math.sqrt(Math.max(0, C - 2 * N * Math.sin(phi))) / N;
  const theta = N * (lam - LAM0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

// Pre-compute scale + translate to fit CONUS into the viewport.
// Math y grows upward (north = positive); SVG y grows downward.
// We flip y inside projPath so the rendered choropleth has north on top.
function computeTransform(){
  const corners = [
    project(-125, 50), project(-66, 50),
    project(-125, 24), project(-66, 24),
    project(-95, 49), project(-95, 25),
  ];
  const xs = corners.map(c=>c[0]); const ys = corners.map(c=>c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);  // y0 south, y1 north (math)
  const dx = x1 - x0, dy = y1 - y0;
  const s = Math.min((W - 2 * PAD) / dx, (H - 2 * PAD) / dy);
  const tx = -x0 * s + (W - dx * s) / 2;
  // Want northern math y1 to map to screen top (PAD), southern y0 to screen bottom.
  // screen_y = -y_math * s + ty   with ty = PAD + s * y1
  const ty = PAD + s * y1 + (H - 2 * PAD - dy * s) / 2;
  return { s, tx, ty };
}
const { s: SCALE, tx: TX, ty: TY } = computeTransform();

function projPath(lon, lat){
  const [x, y] = project(lon, lat);
  return [x * SCALE + TX, -y * SCALE + TY];
}

// Convert a client (screen) point to viewBox coordinates, accounting for the
// SVG's preserveAspectRatio="xMidYMid meet" letterboxing. The naive
// (clientX-rect.left)/rect.width*W is wrong whenever the element's aspect ratio
// differs from W/H, which shifted inspect clicks (typically southward).
function clientToVB(el, clientX, clientY){
  const rect = el.getBoundingClientRect();
  const scale = Math.min(rect.width / W, rect.height / H);
  const offX = (rect.width - W * scale) / 2, offY = (rect.height - H * scale) / 2;
  return [(clientX - rect.left - offX) / scale, (clientY - rect.top - offY) / scale];
}

// Convert a single ring (array of [lon,lat]) to SVG path commands
function ringToD(ring){
  let d = "";
  for(let i = 0; i < ring.length; i++){
    const [x, y] = projPath(ring[i][0], ring[i][1]);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d + "Z";
}

// Convert a (Multi)Polygon geometry to a path d string
function geomToD(geom){
  if(!geom) return "";
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.map(poly => poly.map(ringToD).join(" ")).join(" ");
}

function pickColorCoverage(engines, focal, hasSeries){
  // Punchier, higher-contrast emerald ramp for more visual pop.
  let fill = "#26323c";
  if(engines >= 20) fill = "#0e8a4d";
  else if(engines >= 6) fill = "#22b56e";
  else if(engines >= 4) fill = "#5bd699";
  else if(engines >= 1) fill = "#a9ecca";
  return fill;
}
// Linear interpolation between hex colors at stops
function rampCarbon(v){
  if(v == null || v < 0) return null;
  const stops = [
    [0, [237, 248, 233]],
    [100, [186, 228, 179]],
    [300, [116, 196, 118]],
    [500, [49, 163, 84]],
    [1000, [0, 90, 50]],
  ];
  if(v >= stops[stops.length - 1][0]) return rgbHex(stops[stops.length - 1][1]);
  for(let i = 0; i < stops.length - 1; i++){
    const [a, ca] = stops[i], [b, cb] = stops[i+1];
    if(v <= b){
      const t = (v - a) / (b - a);
      return rgbHex([0,1,2].map(k => Math.round(ca[k] + t * (cb[k] - ca[k]))));
    }
  }
  return rgbHex(stops[0][1]);
}
function rgbHex(rgb){ return "#" + rgb.map(v=> v.toString(16).padStart(2, "0")).join(""); }
// HRR priority-share ramp (% of forest that is high-stress, low-resilience).
// Sequential green -> yellow -> red, anchored at the national max (~75%, KS).
function rampHealth(v){
  if(v == null || isNaN(v)) return null;
  const stops = [
    [0,   [43, 138, 99]],
    [10,  [154, 217, 184]],
    [25,  [230, 210, 74]],
    [45,  [224, 138, 30]],
    [75,  [204, 59, 34]],
  ];
  if(v >= stops[stops.length - 1][0]) return rgbHex(stops[stops.length - 1][1]);
  for(let i = 0; i < stops.length - 1; i++){
    const [a, ca] = stops[i], [b, cb] = stops[i+1];
    if(v <= b){
      const t = (v - a) / (b - a);
      return rgbHex([0,1,2].map(k => Math.round(ca[k] + t * (cb[k] - ca[k]))));
    }
  }
  return rgbHex(stops[0][1]);
}
// HRR bivariate palette: stress class (x) by resilience class (y), matching the
// static figures. Used for the 0.5deg health surface when grid breaks are present.
const HRR_BIV = {
  "0-0":"#e8e8e8","1-0":"#e4acac","2-0":"#c85a5a",
  "0-1":"#b0d5df","1-1":"#ad9ea5","2-1":"#985356",
  "0-2":"#64acbe","1-2":"#627f8c","2-2":"#574249",
};
function hrrBiFill(stress, resil, bk){
  if(!bk || stress == null || resil == null) return null;
  const sx = stress < bk.qx[0] ? 0 : stress < bk.qx[1] ? 1 : 2;
  const sy = resil  < bk.qy[0] ? 0 : resil  < bk.qy[1] ? 1 : 2;
  return HRR_BIV[sx + "-" + sy];
}

export default function SVGMap({ geo, states, focal = [], mode = "coverage",
                                  timeline, mapYear, mapScenario, selected, onPick,
                                  conusOverlay, conusOverlayBounds, conusOverlayOpacity = 0.7,
                                  stateOverlay, stateOverlayBounds, stateOverlayOpacity = 0.7,
                                  ecoData, ecoFill, ecoOpacity = 0.75,
                                  inspectMode = false, onInspect, userLoc = null,
                                  baseLayer = null, baseBounds = null, baseOpacity = 0.6,
                                  focusGeom = null, hrr = null, hrrGrid = null, hrrCounty = null, hrrHex = null,
                                  hrrEcoGeo = null, hrrEco = null,
                                  countyGeo = null, countyPri = null, landCounty = null, landEco = null, landHex = null }){
  // Top ownership types for a unit's composition object, for map tooltips.
  const ownTop = (o) => { if(!o) return ""; return Object.entries(o).filter(([,v])=>v>0)
    .sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ${Math.round(v)}%`).join(", "); };
  // v0.71 stable zoom/pan: ref-backed view (no re-renders during continuous
  // interaction) + rAF-throttled state sync.
  const viewRef = useRef({ k: 1, tx: 0, ty: 0 });
  const [, force] = useState(0);
  const rafRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const movedRef = useRef(false);   // true once a press has dragged (suppresses click)
  const animRef = useRef(null);     // active zoom animation id
  const [isDragging, setIsDragging] = useState(false);
  const sync = () => {
    if(rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      force(n => n + 1);
    });
  };
  const clampView = (v) => {
    // Don't let user pan off-screen: keep at least 1/4 of the map visible.
    const k = Math.max(0.5, Math.min(8, v.k));
    const maxPan = Math.max(W, H) * k * 0.75;
    return {
      k,
      tx: Math.max(-maxPan, Math.min(maxPan, v.tx)),
      ty: Math.max(-maxPan, Math.min(maxPan, v.ty)),
    };
  };
  useEffect(() => {
    const el = svgRef.current; if(!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const [cx, cy] = clientToVB(el, e.clientX, e.clientY);
      // Adaptive zoom factor: small wheel delta = small step, big = big step.
      // Cap deltaY magnitude to prevent extreme jumps on trackpads.
      const mag = Math.min(50, Math.abs(e.deltaY)) / 50;
      const dk = e.deltaY < 0 ? (1 + 0.20 * mag) : 1 / (1 + 0.20 * mag);
      const v = viewRef.current;
      const k2 = Math.max(0.5, Math.min(8, v.k * dk));
      const tx2 = cx - (cx - v.tx) * (k2 / v.k);
      const ty2 = cy - (cy - v.ty) * (k2 / v.k);
      viewRef.current = clampView({ k: k2, tx: tx2, ty: ty2 });
      sync();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const onMouseDown = (e) => {
    if(e.button !== 0) return;
    movedRef.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY,
                         tx: viewRef.current.tx, ty: viewRef.current.ty };
    setIsDragging(true);
  };
  const onMouseMove = (e) => {
    if(!dragRef.current) return;
    if(Math.abs(e.clientX - dragRef.current.x) + Math.abs(e.clientY - dragRef.current.y) > 4)
      movedRef.current = true;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const dx = (e.clientX - dragRef.current.x) / scale;
    const dy = (e.clientY - dragRef.current.y) / scale;
    viewRef.current = clampView({ ...viewRef.current,
      tx: dragRef.current.tx + dx, ty: dragRef.current.ty + dy });
    sync();
  };
  const onMouseUp = (e) => {
    const dr = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    // crosshair inspect: a click (no meaningful drag) reports lon/lat
    if(inspectMode && dr && e && svgRef.current && e.type === "mouseup"){
      const moved = Math.abs(e.clientX - dr.x) + Math.abs(e.clientY - dr.y);
      if(moved < 5){
        const [cx, cy] = clientToVB(svgRef.current, e.clientX, e.clientY);
        const v = viewRef.current;
        const gx = (cx - v.tx) / v.k, gy = (cy - v.ty) / v.k;
        const x = (gx - TX) / SCALE, y = -(gy - TY) / SCALE;
        const [lon, lat] = projectInverse(x, y);
        onInspect && onInspect(lon, lat);
      }
    }
  };
  const resetView = () => { viewRef.current = { k: 1, tx: 0, ty: 0 }; sync(); };
  const zoomBy = (dk) => {
    const v = viewRef.current;
    const k2 = Math.max(0.5, Math.min(8, v.k * dk));
    // Zoom around viewport center
    const tx2 = W/2 - (W/2 - v.tx) * (k2 / v.k);
    const ty2 = H/2 - (H/2 - v.ty) * (k2 / v.k);
    viewRef.current = clampView({ k: k2, tx: tx2, ty: ty2 });
    sync();
  };
  // animate the view to a target {k,tx,ty} with easeInOutQuad
  const animateTo = (target) => {
    if(animRef.current) cancelAnimationFrame(animRef.current);
    const start = { ...viewRef.current }, t0 = performance.now(), dur = 450;
    const tick = (now) => {
      const e = Math.min(1, (now - t0) / dur);
      const f = e < 0.5 ? 2*e*e : 1 - Math.pow(-2*e + 2, 2) / 2;
      viewRef.current = {
        k:  start.k  + (target.k  - start.k)  * f,
        tx: start.tx + (target.tx - start.tx) * f,
        ty: start.ty + (target.ty - start.ty) * f,
      };
      sync();
      if(e < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  };
  // click-to-zoom: fit a (Multi)Polygon feature into the viewport
  const fitFeature = (geom) => {
    if(!geom) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const scan = ring => ring.forEach(([lon, lat]) => {
      const [sx, sy] = projPath(lon, lat);
      if(sx < x0) x0 = sx; if(sx > x1) x1 = sx;
      if(sy < y0) y0 = sy; if(sy > y1) y1 = sy;
    });
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    polys.forEach(p => p.forEach(scan));
    const bw = x1 - x0, bh = y1 - y0;
    if(!(bw > 0 && bh > 0)) return;
    const pad = 48;
    const k = Math.max(0.5, Math.min(8, Math.min((W - pad) / bw, (H - pad) / bh)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    animateTo(clampView({ k, tx: W/2 - cx * k, ty: H/2 - cy * k }));
  };
  // Auto-zoom to a geometry (e.g. the "forest near me" AOI box) when it changes.
  const lastFocusRef = useRef(null);
  useEffect(() => {
    if(focusGeom && focusGeom !== lastFocusRef.current){
      lastFocusRef.current = focusGeom;
      fitFeature(focusGeom);
    }
  }, [focusGeom]);
  const view = viewRef.current;

  if(!geo || !states) return <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"100%",display:"block"}}/>;
  const features = (geo.features || []).filter(ft => ft.properties && ft.properties.state);
  const yrKey = String(mapYear);
  // CONUS overlay placement: bounds are in projected Albers METERS (gdalwarp
  // emits proj-meters). Our SVG projection outputs in radians on the unit
  // sphere, so divide by Earth radius before applying SCALE / TX / TY.
  let conusBox = null;
  if(conusOverlay && conusOverlayBounds){
    const { x0, x1, y0, y1 } = conusOverlayBounds;
    const rx0 = x0 / EARTH_R, rx1 = x1 / EARTH_R;
    const ry0 = y0 / EARTH_R, ry1 = y1 / EARTH_R;
    const sx0 = rx0 * SCALE + TX;
    const sx1 = rx1 * SCALE + TX;
    const sy0 = -ry0 * SCALE + TY;
    const sy1 = -ry1 * SCALE + TY;
    conusBox = { x: Math.min(sx0, sx1), y: Math.min(sy0, sy1),
                 width: Math.abs(sx1 - sx0), height: Math.abs(sy1 - sy0) };
  }
  // Forest/non-forest base layer placement (same projected-meter frame).
  let baseBox = null;
  if(baseLayer && baseBounds){
    const { x0, x1, y0, y1 } = baseBounds;
    const sx0 = (x0 / EARTH_R) * SCALE + TX, sx1 = (x1 / EARTH_R) * SCALE + TX;
    const sy0 = -(y0 / EARTH_R) * SCALE + TY, sy1 = -(y1 / EARTH_R) * SCALE + TY;
    baseBox = { x: Math.min(sx0, sx1), y: Math.min(sy0, sy1),
                width: Math.abs(sx1 - sx0), height: Math.abs(sy1 - sy0) };
  }
  // Per-state overlay placement.
  //   v0.69+: bounds in Albers meters (x0/y0/x1/y1) when the PNG was warped to
  //           Albers. Treated identically to CONUS bounds.
  //   legacy: bounds in WGS84 corners (ul/ur/lr/ll) — project corners + bbox.
  let stateBox = null;
  if(stateOverlay && stateOverlayBounds){
    if(stateOverlayBounds.x0 != null){
      const { x0, x1, y0, y1 } = stateOverlayBounds;
      const rx0 = x0 / EARTH_R, rx1 = x1 / EARTH_R;
      const ry0 = y0 / EARTH_R, ry1 = y1 / EARTH_R;
      const sx0 = rx0 * SCALE + TX, sx1 = rx1 * SCALE + TX;
      const sy0 = -ry0 * SCALE + TY, sy1 = -ry1 * SCALE + TY;
      stateBox = { x: Math.min(sx0, sx1), y: Math.min(sy0, sy1),
                   width: Math.abs(sx1 - sx0), height: Math.abs(sy1 - sy0) };
    } else if(stateOverlayBounds.ul){
      const corners = [stateOverlayBounds.ul, stateOverlayBounds.ur,
                       stateOverlayBounds.lr, stateOverlayBounds.ll];
      const sxs = [], sys = [];
      corners.forEach(([lon, lat]) => {
        const [x, y] = project(lon, lat);
        sxs.push(x * SCALE + TX);
        sys.push(-y * SCALE + TY);
      });
      stateBox = { x: Math.min(...sxs), y: Math.min(...sys),
                   width: Math.max(...sxs) - Math.min(...sxs),
                   height: Math.max(...sys) - Math.min(...sys) };
    }
  }
  // Precompute the selected state's path for the clipPath used by the
  // per-state image overlay (so the PNG is clipped to the state polygon).
  const selFeature = features.find(ft => ft.properties.state === selected);
  const selPathD = selFeature ? geomToD(selFeature.geometry) : null;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
         style={{width:"100%",height:"100%",display:"block",
                 cursor: inspectMode ? "crosshair" : (isDragging ? "grabbing" : "grab"),
                 touchAction: "none"}}
         preserveAspectRatio="xMidYMid meet"
         onMouseDown={onMouseDown} onMouseMove={onMouseMove}
         onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
         onDoubleClick={()=> zoomBy(1.5)}>
      <defs>
        {selPathD && (
          <clipPath id="clip-selected-state"><path d={selPathD}/></clipPath>
        )}
        <linearGradient id="ocean-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10212e"/>
          <stop offset="55%" stopColor="#0c1722"/>
          <stop offset="100%" stopColor="#070d13"/>
        </linearGradient>
        <radialGradient id="ocean-vignette" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#16344a" stopOpacity="0.45"/>
          <stop offset="60%" stopColor="#0c1722" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="url(#ocean-bg)"/>
      <rect x="0" y="0" width={W} height={H} fill="url(#ocean-vignette)"/>
      <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
      {baseLayer && baseBox && (
        <image href={baseLayer} x={baseBox.x} y={baseBox.y}
               width={baseBox.width} height={baseBox.height}
               opacity={baseOpacity} preserveAspectRatio="none"
               style={{pointerEvents:"none"}}/>
      )}
      {conusOverlay && conusBox && (
        <image href={conusOverlay} x={conusBox.x} y={conusBox.y}
               width={conusBox.width} height={conusBox.height}
               opacity={conusOverlayOpacity} preserveAspectRatio="none"/>
      )}
      {ecoData && ecoData.features && ecoData.features.map((ft,i)=>{
        const code = ft.properties && ft.properties.NA_L3CODE;
        const fill = ecoFill ? ecoFill(code) : null;
        return <path key={"eco"+i} d={geomToD(ft.geometry)}
                 fill={fill || "#2a3a47"} fillOpacity={fill ? ecoOpacity : 0.12}
                 stroke="#0b1015" strokeWidth={0.15}
                 style={{pointerEvents:"none"}}/>;
      })}
      {mode === "health" && hrrGrid && hrrGrid.cells && (
        <g style={{pointerEvents:"none"}}>
          {hrrGrid.cells.map((c, i) => {
            const lat = c[0], lon = c[1], idx = c[2];
            const [x0, y0] = projPath(lon - 0.25, lat + 0.25);
            const [x1, y1] = projPath(lon + 0.25, lat - 0.25);
            const x = Math.min(x0, x1), y = Math.min(y0, y1);
            const w = Math.abs(x1 - x0) * 1.18, h = Math.abs(y1 - y0) * 1.18;
            // True bivariate fill (stress x resilience) when grid breaks are present;
            // fall back to the single priority-index ramp otherwise.
            const biv = hrrBiFill(c[3], c[4], hrrGrid.breaks);
            return <rect key={"g" + i} x={x} y={y} width={w} height={h}
              fill={biv || rampHealth(idx * 100)} opacity={0.9} />;
          })}
        </g>
      )}
      {mode === "health" && hrrHex && hrrHex.cells && (
        <g style={{pointerEvents:"none"}}>
          {hrrHex.cells.map((c, i) => {
            const pts = c.b.map(([la, lo]) => projPath(lo, la).join(",")).join(" ");
            return <polygon key={"h" + i} points={pts}
              fill={HRR_BIV[c.sx + "-" + c.sy]} opacity={0.9} stroke="#0b1015" strokeWidth={0.15} />;
          })}
        </g>
      )}
      {mode === "health" && countyGeo && countyGeo.features && countyPri && (
        <g style={{pointerEvents:"none"}}>
          {countyGeo.features.map((ft, i) => {
            const gid = ft.properties && ft.properties.GEOID;
            const c = gid != null ? countyPri[String(parseInt(gid, 10))] : null; // hrr_county keys are FIPS w/o leading zero
            return <path key={"cty" + i} d={geomToD(ft.geometry)}
              fill={c ? rampHealth(c.priority_pct) : "#2a3a47"} fillOpacity={c ? 0.9 : 0.1}
              stroke="#0b1015" strokeWidth={0.12} />;
          })}
        </g>
      )}
      {mode === "health" && !countyGeo && hrrCounty && hrrCounty.counties && (
        <g style={{pointerEvents:"none"}}>
          {Object.entries(hrrCounty.counties).map(([fips, c]) => {
            const [cx, cy] = projPath(c.lon, c.lat);
            const r = Math.max(1.6, Math.sqrt(c.n) * 0.55);
            return <circle key={"c" + fips} cx={cx} cy={cy} r={r}
              fill={rampHealth(c.priority_pct)} opacity={0.85} stroke="#0b1015" strokeWidth={0.2} />;
          })}
        </g>
      )}
      {mode === "health" && hrrEcoGeo && hrrEcoGeo.features && hrrEco && hrrEco.ecoregions && (
        <g style={{pointerEvents:"none"}}>
          {hrrEcoGeo.features.map((ft, i) => {
            const code = ft.properties && ft.properties.NA_L3CODE;
            const e = code && hrrEco.ecoregions[code];
            return <path key={"eco" + i} d={geomToD(ft.geometry)}
              fill={e ? rampHealth(e.priority_pct) : "#2a3a47"} fillOpacity={e ? 0.85 : 0.12}
              stroke="#0b1015" strokeWidth={0.15} />;
          })}
        </g>
      )}
      {features.map(ft=>{
        const st = ft.properties.state;
        const cov = states[st] || {};
        const isFocal = focal.includes(st);
        const hasSeries = !!cov.has_series;
        const hrrSt = hrr && hrr[st];
        let fill, opacity;
        if(mode === "health"){
          const col = hrrSt ? rampHealth(hrrSt.priority_pct) : null;
          fill = col || "#2a3a47";
          // Hide state fills under a full-coverage unit (surface/hex/ecoregion);
          // strongly dim them under county dots so counties read as the unit.
          opacity = (hrrGrid || hrrHex || hrrEcoGeo) ? 0 : (hrrCounty ? 0.12 : (col ? 0.92 : 0.30));
        } else if(mode === "carbon"){
          const v = (timeline && timeline[st] && timeline[st][mapScenario] && timeline[st][mapScenario][yrKey]);
          const col = rampCarbon(v != null ? v : -1);
          fill = col || "#2a3a47";
          opacity = col ? 0.92 : 0.35;
        } else {
          fill = pickColorCoverage(cov.engines || 0, isFocal, hasSeries);
          opacity = isFocal ? 0.98 : (hasSeries ? 0.85 : 0.55);
        }
        // When a CONUS overlay is active, dim non-focal state fills so the
        // raster pattern beneath is visible. Keep focal states + selected
        // state outlined / opaque so they remain anchors.
        if((conusOverlay || ecoData || baseLayer) && mode !== "health"){
          // overlay/base active: drop state fills back so the layer beneath reads
          // clearly; keep focal/selected legible via their strokes.
          opacity = isFocal ? 0.30 : 0.06;
        }
        const d = geomToD(ft.geometry);
        const isSel = st === selected;
        const stroke = isFocal ? "#ffd23a" : (isSel ? "#ffffff" : "#0b1015");
        const sw = isSel ? 2.6 : (isFocal ? 2.2 : 0.5);
        // In health mode any state with an HRR score is pickable so the readout
        // updates on click; elsewhere only states with model series are pickable.
        const pickable = mode === "health" ? !!hrrSt : hasSeries;
        const title = mode === "health"
          ? `${st}${cov.name?" · "+cov.name:""}${hrrSt?` · priority ${hrrSt.priority_pct.toFixed(1)}% of forest`:" · no HRR score"}`
          : `${st}${cov.name?" · "+cov.name:""}${cov.engines?` · ${cov.engines} engines`:" · no model data"}`;
        return (
          <path key={st} d={d} fill={fill} fillOpacity={opacity}
                stroke={stroke} strokeWidth={sw}
                style={{cursor: pickable ? "pointer" : "default"}}
                onClick={()=>{
                  if(inspectMode || movedRef.current) return;
                  fitFeature(ft.geometry);                 // click-to-zoom (#1)
                  if(pickable && onPick) onPick(st);
                }}>
            <title>{title}</title>
          </path>
        );
      })}
      {stateOverlay && stateBox && (
        <image href={stateOverlay} x={stateBox.x} y={stateBox.y}
               width={stateBox.width} height={stateBox.height}
               opacity={stateOverlayOpacity} preserveAspectRatio="none"
               clipPath="url(#clip-selected-state)"
               style={{pointerEvents:"none"}}/>
      )}
      {userLoc && isFinite(userLoc[0]) && isFinite(userLoc[1]) && (()=>{
        const [mx, my] = projPath(userLoc[0], userLoc[1]);
        const r = 6 / view.k;                       // constant screen size at any zoom
        return (
          <g style={{pointerEvents:"none"}}>
            <circle cx={mx} cy={my} r={r*2.2} fill="#2f81f7" opacity="0.22">
              <animate attributeName="r" values={`${r*1.6};${r*2.8};${r*1.6}`}
                       dur="2s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.30;0.05;0.30"
                       dur="2s" repeatCount="indefinite"/>
            </circle>
            <circle cx={mx} cy={my} r={r} fill="#2f81f7"
                    stroke="#ffffff" strokeWidth={1.6/view.k}/>
          </g>
        );
      })()}
      </g>
      {/* Zoom controls (fixed, outside the pan/zoom group) */}
      <g transform={`translate(${W-100},${H-32})`}>
        <rect x="0" y="0" width="92" height="22" rx="4"
              fill="rgba(15,20,25,0.85)" stroke="#2a3a47"/>
        <text x="10" y="15" fill="#8aa0b0" fontSize="11" fontWeight="bold"
              style={{cursor:"pointer",userSelect:"none"}}
              onClick={(e)=>{ e.stopPropagation(); zoomBy(1.4); }}>+</text>
        <text x="28" y="15" fill="#8aa0b0" fontSize="11" fontWeight="bold"
              style={{cursor:"pointer",userSelect:"none"}}
              onClick={(e)=>{ e.stopPropagation(); zoomBy(1/1.4); }}>−</text>
        <text x="46" y="15" fill="#8aa0b0" fontSize="9"
              style={{cursor:"pointer",userSelect:"none"}}
              onClick={(e)=>{ e.stopPropagation(); resetView(); }}>reset</text>
        <text x="70" y="15" fill="#5e7180" fontSize="8" textAnchor="end"
              style={{userSelect:"none"}}>{view.k.toFixed(1)}×</text>
        <text x="86" y="15" fill="#5e7180" fontSize="8" textAnchor="end"
              style={{userSelect:"none"}}>·</text>
      </g>
    </svg>
  );
}
