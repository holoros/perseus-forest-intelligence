// SVG choropleth — pure dependency-free, no WebGL. Hand-rolled US Albers projection.
// Renders the CONUS states as an SVG so the coverage/carbon map always works,
// regardless of maplibre / WebGL availability.
import { useEffect, useRef, useState } from "react";

const W = 640, H = 400;
const PAD = 8;
// Earth radius (m) for converting projected Albers meters <-> our unit-sphere
// projection output (which is in radians). gdalwarp emits bounds in m so the
// CONUS overlay placement needs this conversion.
const EARTH_R = 6378137;
// US Albers parameters (NAD83 Conus Albers standard)
const PHI0 = 38 * Math.PI / 180;
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
  let fill = "#2a3a47";
  if(engines >= 20) fill = "#1b7a4d";
  else if(engines >= 6) fill = "#2f9e6a";
  else if(engines >= 4) fill = "#54b88a";
  else if(engines >= 1) fill = "#9ad9b8";
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

export default function SVGMap({ geo, states, focal = [], mode = "coverage",
                                  timeline, mapYear, mapScenario, selected, onPick,
                                  conusOverlay, conusOverlayBounds, conusOverlayOpacity = 0.7,
                                  stateOverlay, stateOverlayBounds, stateOverlayOpacity = 0.7 }){
  // v0.71 stable zoom/pan: ref-backed view (no re-renders during continuous
  // interaction) + rAF-throttled state sync.
  const viewRef = useRef({ k: 1, tx: 0, ty: 0 });
  const [, force] = useState(0);
  const rafRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
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
      const rect = el.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width * W;
      const cy = (e.clientY - rect.top) / rect.height * H;
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
    dragRef.current = { x: e.clientX, y: e.clientY,
                         tx: viewRef.current.tx, ty: viewRef.current.ty };
    setIsDragging(true);
  };
  const onMouseMove = (e) => {
    if(!dragRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.x) / rect.width * W;
    const dy = (e.clientY - dragRef.current.y) / rect.height * H;
    viewRef.current = clampView({ ...viewRef.current,
      tx: dragRef.current.tx + dx, ty: dragRef.current.ty + dy });
    sync();
  };
  const onMouseUp = () => {
    dragRef.current = null;
    setIsDragging(false);
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
                 cursor: isDragging ? "grabbing" : "grab",
                 touchAction: "none"}}
         preserveAspectRatio="xMidYMid meet"
         onMouseDown={onMouseDown} onMouseMove={onMouseMove}
         onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
         onDoubleClick={()=> zoomBy(1.5)}>
      <defs>
        {selPathD && (
          <clipPath id="clip-selected-state"><path d={selPathD}/></clipPath>
        )}
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="#0b1015"/>
      <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
      {conusOverlay && conusBox && (
        <image href={conusOverlay} x={conusBox.x} y={conusBox.y}
               width={conusBox.width} height={conusBox.height}
               opacity={conusOverlayOpacity} preserveAspectRatio="none"/>
      )}
      {features.map(ft=>{
        const st = ft.properties.state;
        const cov = states[st] || {};
        const isFocal = focal.includes(st);
        const hasSeries = !!cov.has_series;
        let fill, opacity;
        if(mode === "carbon"){
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
        if(conusOverlay){
          opacity = isFocal ? 0.55 : (hasSeries ? 0.25 : 0.15);
        }
        const d = geomToD(ft.geometry);
        const isSel = st === selected;
        const stroke = isFocal ? "#f4c430" : (isSel ? "#ffffff" : "#0b1015");
        const sw = isSel ? 2.0 : (isFocal ? 1.5 : 0.5);
        const title = `${st}${cov.name?" · "+cov.name:""}${cov.engines?` · ${cov.engines} engines`:" · no model data"}`;
        return (
          <path key={st} d={d} fill={fill} fillOpacity={opacity}
                stroke={stroke} strokeWidth={sw}
                style={{cursor: hasSeries ? "pointer" : "default"}}
                onClick={()=> hasSeries && onPick && onPick(st)}>
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
