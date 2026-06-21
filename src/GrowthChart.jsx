// Lightweight dependency-free SVG growth-curve chart.
// v0.70 interactions: hover scrubber with per-engine values, click-to-isolate,
// download-as-PNG button.
import { useRef, useState } from "react";

export default function GrowthChart({ node, fiaRef, fiaYear, unit, classCol,
                                      showBands, showInvBand, hiddenEngines, yMode,
                                      overlayNode, overlayLabel,
                                      isolatedEngine, onIsolate, xMax }){
  const W=560,H=320,L=48,R=70,T=14,B=30;
  const svgRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);

  // Optional user x-axis horizon clamp (projections run to 2125).
  const clampX = s => (xMax && s.pts) ? {...s, pts: s.pts.filter(p=>p[0]<=xMax)} : s;
  const visible = (node||[]).filter(s=> !hiddenEngines || !hiddenEngines.has(s.model)).map(clampX).filter(s=>s.pts.length);
  const visibleOverlay = (overlayNode||[]).filter(s=> !hiddenEngines || !hiddenEngines.has(s.model)).map(clampX).filter(s=>s.pts.length);
  // When an engine is isolated, only that engine's line draws — but keep the
  // full set in `visible` so hovers can re-display values for the others.
  const drawSet = isolatedEngine
    ? visible.filter(s => s.model === isolatedEngine)
    : visible;
  const drawOverlay = isolatedEngine ? [] : visibleOverlay;

  if(!visible.length && !visibleOverlay.length)
    return <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto"}}/>;
  // Per-engine shade within a class, so several same-family lines (e.g. the 3
  // national FVS engines, all orange) are distinguishable rather than a tangle.
  const _shift = (hex, f) => { // f in [-1,1]: <0 darken, >0 lighten
    const h = (hex && hex[0]==="#" && hex.length>=7) ? hex : "#bbbbbb";
    const r=parseInt(h.slice(1,3),16), g=parseInt(h.slice(3,5),16), b=parseInt(h.slice(5,7),16);
    const adj = c => Math.round(f>=0 ? c+(255-c)*f : c*(1+f));
    return `rgb(${adj(r)},${adj(g)},${adj(b)})`;
  };
  const _members = {};
  [...drawSet, ...drawOverlay].forEach(s=>{ (_members[s.cls]=_members[s.cls]||[]); if(!_members[s.cls].includes(s.model)) _members[s.cls].push(s.model); });
  const shadeFor = s => {
    const base = classCol[s.cls] || "#bbb";
    const mem = _members[s.cls] || [s.model];
    if(mem.length < 2) return base;
    const i = mem.indexOf(s.model);
    return _shift(base, ((i/(mem.length-1)) - 0.5) * 0.7);  // spread ±35% lightness
  };
  const xs=[], ys=[];
  const collectPts = (arr) => arr.forEach(s=> s.pts.forEach(p=>{
    xs.push(p[0]); ys.push(p[1]);
    if(showBands && p.length>=4){ ys.push(p[2]); ys.push(p[3]); } }));
  collectPts(visible); collectPts(visibleOverlay);
  if(fiaRef!=null) ys.push(fiaRef);
  const x0=Math.min(...xs), x1=Math.max(...xs);
  let y0=0, y1=Math.max(...ys)*1.05 || 1;
  if(yMode === "auto" && ys.length > 4){
    const sorted = ys.slice().sort((a,b)=>a-b);
    const q1 = sorted[Math.floor(sorted.length*0.10)];
    const q3 = sorted[Math.floor(sorted.length*0.90)];
    const pad = (q3-q1)*0.25;
    y0 = Math.max(0, q1-pad);
    y1 = q3+pad;
  }
  const X = v => L+(v-x0)/((x1-x0)||1)*(W-L-R);
  let Y;
  if(yMode === "log"){
    const ly0 = Math.log10(Math.max(0.1, y0||0.1));
    const ly1 = Math.log10(Math.max(y1, 1));
    Y = v => (H-B) - (Math.log10(Math.max(0.1, v))-ly0)/((ly1-ly0)||1)*(H-T-B);
  } else {
    Y = v => (H-B) - (v-y0)/((y1-y0)||1)*(H-T-B);
  }
  const grid=[];
  let yticks=[];
  if(yMode==="log"){
    const ly0 = Math.log10(Math.max(0.1, y0||0.1));
    const ly1 = Math.log10(Math.max(y1, 1));
    for(let i=0;i<=4;i++) yticks.push(Math.pow(10, ly0 + (ly1-ly0)*i/4));
  } else {
    // "nice" round-number ticks that adapt to the visible data range
    const range = (y1 - y0) || 1;
    const raw = range / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    // round the top up to a clean tick so the tallest lines have a labeled tick
    // above them (axis visibly spans the full data, no lines jammed at the edge)
    y1 = Math.ceil(y1 / step - 1e-9) * step;
    const start = Math.ceil(y0 / step) * step;
    for(let v = start; v <= y1 + step*1e-6; v += step) yticks.push(+v.toFixed(6));
    if(yticks.length < 2) yticks = [y0, y1];
  }
  // Decimal places from the actual tick STEP, so narrow ranges (e.g. RD ticks
  // 0.46/0.48/0.50) don't all collapse to the same label under toFixed(1).
  const ystep = yticks.length>1 ? Math.abs(yticks[1]-yticks[0]) : (y1-y0)||1;
  const ydec = ystep>=1 ? 0 : ystep>=0.1 ? 1 : ystep>=0.01 ? 2 : 3;
  yticks.forEach((v,i)=>{
    const yy=Y(v);
    grid.push(<g key={"g"+i}>
      <line x1={L} y1={yy} x2={W-R} y2={yy} stroke="#2a3a47" strokeWidth="1"/>
      <text x={L-6} y={yy+3} textAnchor="end" fill="#8aa0b0" fontSize="10">
        {v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(ydec)}
      </text>
    </g>);
  });
  // Adaptive x-axis ticks: a "nice" step from the year span, so short spans
  // (2016-2022) show several labels instead of a lone "2020".
  const xspan = (x1-x0)||1, xraw = xspan/5;
  const xmag = Math.pow(10, Math.floor(Math.log10(xraw))), xnorm = xraw/xmag;
  const xstep = Math.max(1, (xnorm<1.5?1:xnorm<3?2:xnorm<7?5:10)*xmag);
  const xticks=[]; for(let t=Math.ceil(x0/xstep)*xstep; t<=x1+1e-6; t+=xstep)
    xticks.push(<text key={"x"+t} x={X(t)} y={H-B+16} textAnchor="middle" fill="#8aa0b0" fontSize="10">{Math.round(t)}</text>);
  // Uncertainty bands aggregated by model CLASS (one soft envelope per family)
  // rather than one per engine — with many engines, per-engine bands stack into
  // an unreadable blob. The class envelope spans min(lo)..max(hi) across the
  // family at each year. Fewer bands draw darker so they remain visible.
  const bands = showBands ? (() => {
    const byCls = {};
    visible.forEach(s => { if(s.pts.some(p=>p.length>=4)) (byCls[s.cls]=byCls[s.cls]||[]).push(s); });
    const entries = Object.entries(byCls);
    const op = entries.length <= 2 ? 0.16 : entries.length <= 4 ? 0.12 : 0.09;
    return entries.map(([cls, ser]) => {
      const col = classCol[cls] || "#bbb";
      const byYr = {};
      ser.forEach(s => s.pts.forEach(p => { if(p.length>=4){ (byYr[p[0]]=byYr[p[0]]||{lo:[],hi:[]}); byYr[p[0]].lo.push(p[2]); byYr[p[0]].hi.push(p[3]); } }));
      const yrs = Object.keys(byYr).map(Number).sort((a,b)=>a-b);
      if(yrs.length < 2) return null;
      const up = yrs.map((y,k)=> (k?"L":"M") + X(y).toFixed(1) + " " + Y(Math.max(...byYr[y].hi)).toFixed(1)).join(" ");
      const dn = yrs.slice().reverse().map(y=> "L" + X(y).toFixed(1) + " " + Y(Math.min(...byYr[y].lo)).toFixed(1)).join(" ");
      return <path key={"b"+cls} d={up+" "+dn+" Z"} fill={col} opacity={op} stroke="none"><title>{cls} ensemble range</title></path>;
    });
  })() : null;
  const INV_MODELS=["yc_hybrid_v1","yc_treemap_spatial_v1"];
  const invBand = (showInvBand ? (()=>{
    const ser=visible.filter(s=>INV_MODELS.includes(s.model));
    if(ser.length<2) return null;
    const byYr={}; ser.forEach(s=>s.pts.forEach(p=>{(byYr[p[0]]=byYr[p[0]]||[]).push(p[1]);}));
    const yrs=Object.keys(byYr).map(Number).filter(y=>byYr[y].length>=2).sort((a,b)=>a-b);
    if(yrs.length<2) return null;
    const up=yrs.map((y,k)=>(k?"L":"M")+X(y).toFixed(1)+" "+Y(Math.max(...byYr[y])).toFixed(1)).join(" ");
    const dn=yrs.slice().reverse().map(y=>"L"+X(y).toFixed(1)+" "+Y(Math.min(...byYr[y])).toFixed(1)).join(" ");
    return <path d={up+" "+dn+" Z"} fill="#caa15a" opacity="0.18" stroke="none"><title>Inventory-basis range: FIA-anchored (yc_hybrid) vs TreeMap pixel</title></path>;
  })() : null);
  // Per-class line STYLE (dash pattern), so model families are distinguishable
  // by line type as well as by the per-engine color shade.
  const DASH = { CEM:"0", CBM:"7 3", FVS:"4 3", YC:"1.5 3", LANDIS:"9 3 2 3",
                 OSM:"6 2", ES:"2 2", ECON:"7 2 2 2" };
  const dashFor = s => DASH[s.cls] != null ? DASH[s.cls] : "0";
  const drawLine = (s, i, dashed, dense) => {
    const col = shadeFor(s);
    const d = s.pts.map((p,k)=> (k? "L":"M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
    const tag = dashed ? `${s.label} · ${overlayLabel||"compare"}` : `${s.label}`;
    // When many engines draw, thin and fade member lines so the class bands and
    // family labels carry the story instead of a tangle of equal-weight lines.
    const sw = dashed ? 1.2 : (dense ? 1.0 : 1.8);
    const op = dashed ? 0.55 : (dense ? 0.5 : 0.95);
    return <g key={(dashed?"o":"")+i}>
      <path d={d} fill="none" stroke="transparent" strokeWidth="9"
            style={{cursor:"pointer"}}
            onClick={()=> !dashed && onIsolate && onIsolate(s.model)}>
        <title>{`${tag} (${s.cls}) — click to isolate`}</title>
      </path>
      <path d={d} fill="none" stroke={col} strokeWidth={sw}
            opacity={op}
            strokeDasharray={dashFor(s)}
            style={{pointerEvents:"none"}}/>
    </g>;
  };
  // Collision-avoided trailing labels: stack each line's end label in the right
  // gutter, spread vertically so several converging lines don't overprint.
  const labelItems = [...drawSet.map(s=>({s,dashed:false})), ...drawOverlay.map(s=>({s,dashed:true}))]
    .map(({s,dashed})=>({ model:s.model, col:shadeFor(s), dash:dashFor(s), dashed,
      y0:Math.max(T+5, Math.min(H-B-3, Y(s.pts[s.pts.length-1][1]))) }))
    .sort((a,b)=>a.y0-b.y0);
  { const top=T+4, bot=H-B-3, GAP=9.5;
    // pass 1: top-down, never overlapping
    let prev = top - GAP;
    for(const it of labelItems){ it.ly = Math.max(it.y0, prev + GAP); prev = it.ly; }
    // pass 2: if the stack ran past the bottom, clamp from the bottom up so the
    // lower cluster (many converging lines) spreads cleanly instead of piling up
    if(labelItems.length && labelItems[labelItems.length-1].ly > bot){
      let next = bot + GAP;
      for(let i=labelItems.length-1;i>=0;i--){ labelItems[i].ly = Math.min(labelItems[i].ly, next - GAP); next = labelItems[i].ly; }
    } }
  // Beyond ~12 lines the gutter labels become unreadable noise — drop them and
  // show a short hint instead (color + line style still distinguish families,
  // and hover/click identifies any line). When isolating, always label.
  const DENSE = labelItems.length > 12 && !isolatedEngine;
  // When dense, label by model FAMILY (one tag per class at its median end value)
  // instead of dropping all labels — so every family of simulations is named on
  // the chart, with hover/click still identifying individual engines.
  let famLabels = null;
  if(DENSE){
    const famMap = {};
    drawSet.forEach(s => { (famMap[s.cls]=famMap[s.cls]||[]).push(Y(s.pts[s.pts.length-1][1])); });
    famLabels = Object.entries(famMap).map(([cls,ys]) => { ys.sort((a,b)=>a-b);
      return { cls, n: ys.length, col: classCol[cls] || "#bbb", dash: DASH[cls]!=null?DASH[cls]:"0",
        y0: Math.max(T+5, Math.min(H-B-3, ys[Math.floor(ys.length/2)])) }; })
      .sort((a,b)=>a.y0-b.y0);
    let prev = T+4-13; for(const it of famLabels){ it.ly = Math.max(it.y0, prev+13); prev = it.ly; }
    if(famLabels.length && famLabels[famLabels.length-1].ly > H-B-3){ let next = H-B-3+13;
      for(let i=famLabels.length-1;i>=0;i--){ famLabels[i].ly = Math.min(famLabels[i].ly, next-13); next = famLabels[i].ly; } }
  }
  const endLabels = DENSE
    ? [<text key="hint" x={W-R+4} y={T+6} fill="#5e7180" fontSize="7" style={{pointerEvents:"none"}}>
         {labelItems.length} engines · hover to ID</text>,
       ...famLabels.map((it,k)=>(
         <g key={"fam"+k} style={{pointerEvents:"none"}}>
           <line x1={W-R+1} y1={it.ly} x2={W-R+6} y2={it.ly} stroke={it.col} strokeWidth="2.4" strokeDasharray={it.dash}/>
           <text x={W-R+9} y={it.ly+3} fill={it.col} fontSize="9" fontWeight="600" textAnchor="start">{it.cls} ({it.n})</text>
         </g>))]
    : labelItems.map((it,k)=>(
        <g key={"lab"+k} style={{pointerEvents:"none"}}>
          <line x1={W-R+1} y1={it.ly} x2={W-R+5} y2={it.ly} stroke={it.col} strokeWidth="1.4" strokeDasharray={it.dash}/>
          <text x={W-R+7} y={it.ly+2.6} fill={it.col} fontSize="7.5" textAnchor="start" opacity={it.dashed?0.7:1}>
            {it.model.replace(/_/g," ").slice(0,15)}{it.dashed?" ·"+overlayLabel:""}</text>
        </g>));

  // Hover scrubber: find the year nearest the cursor x, look up each engine's
  // value at that year (linear-interpolated between bracketing pts).
  const onMouseMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * W;
    if(sx < L || sx > W - R){ setHoverX(null); return; }
    setHoverX(sx);
  };
  const valueAt = (s, year) => {
    const pts = s.pts;
    if(!pts.length) return null;
    if(year <= pts[0][0]) return pts[0][1];
    if(year >= pts[pts.length-1][0]) return pts[pts.length-1][1];
    for(let i = 1; i < pts.length; i++){
      const [x_a, y_a] = pts[i-1], [x_b, y_b] = pts[i];
      if(year >= x_a && year <= x_b){
        const t = (year - x_a) / (x_b - x_a || 1);
        return y_a + t * (y_b - y_a);
      }
    }
    return null;
  };
  const hoverYear = hoverX != null
    ? Math.round((x0 + (hoverX - L) / (W - L - R) * (x1 - x0)))
    : null;

  // Download chart as PNG
  const downloadPng = () => {
    const svg = svgRef.current;
    if(!svg) return;
    const cloned = svg.cloneNode(true);
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    // Inline background so PNG isn't transparent
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x","0"); bg.setAttribute("y","0");
    bg.setAttribute("width",String(W)); bg.setAttribute("height",String(H));
    bg.setAttribute("fill","#172029");
    cloned.insertBefore(bg, cloned.firstChild);
    const data = new XMLSerializer().serializeToString(cloned);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const SCALE = 2; canvas.width = W*SCALE; canvas.height = H*SCALE;
      const ctx = canvas.getContext("2d");
      ctx.scale(SCALE, SCALE);
      ctx.drawImage(img, 0, 0);
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `perseus_chart_${Date.now()}.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(data)));
  };

  return (
    <div style={{position:"relative"}}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
           style={{width:"100%",height:"auto",display:"block"}}
           onMouseMove={onMouseMove} onMouseLeave={()=> setHoverX(null)}>
        {grid}{xticks}{invBand}{bands}
        {fiaRef!=null && fiaRef >= y0 && fiaRef <= y1 && <>
          <line x1={L} y1={Y(fiaRef)} x2={W-R} y2={Y(fiaRef)} stroke="#9fb3c0" strokeDasharray="5 4" strokeWidth="1"/>
          <text x={L+4} y={Y(fiaRef)-4} fill="#8aa0b0" fontSize="10">FIA observed {fiaRef} Tg{fiaYear?` (${fiaYear})`:""}</text>
        </>}
        {drawSet.map((s,i)=> drawLine(s, i, false, DENSE))}
        {drawOverlay.map((s,i)=> drawLine(s, i, true, DENSE))}
        {endLabels}
        {hoverX != null && (
          <line x1={hoverX} y1={T} x2={hoverX} y2={H-B}
                stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1"
                strokeDasharray="3 3" style={{pointerEvents:"none"}}/>
        )}
        <text x={L} y={T} fill="#8aa0b0" fontSize="10">{unit||""}</text>
      </svg>
      {hoverX != null && hoverYear != null && (
        <div style={{
          position:"absolute", top:8,
          left: hoverX/W*100 + "%", transform: hoverX/W > 0.7 ? "translateX(-100%)" : "none",
          background:"rgba(15,20,25,0.92)", color:"#e8eef2",
          border:"1px solid var(--line)", borderRadius:6,
          padding:"4px 8px", fontSize:11, pointerEvents:"none",
          maxWidth: 220, fontVariantNumeric:"tabular-nums"
        }}>
          <div style={{color:"#8aa0b0", marginBottom:2}}>year {hoverYear}</div>
          {drawSet.slice(0, 8).map(s => {
            const v = valueAt(s, hoverYear);
            if(v == null) return null;
            const col = shadeFor(s);
            return (
              <div key={s.model} style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <span><i style={{display:"inline-block",width:8,height:8,
                  background:col,borderRadius:2,marginRight:4,verticalAlign:"middle"}}/>
                  {s.model.replace(/_/g," ").slice(0,18)}</span>
                <span>{v >= 1000 ? (v/1000).toFixed(1)+"k" : v.toFixed(1)}</span>
              </div>);
          })}
        </div>
      )}
      <div style={{position:"absolute", top:6, right:8, display:"flex", gap:6}}>
        {isolatedEngine && (
          <button onClick={()=> onIsolate && onIsolate(null)}
            style={{background:"transparent",color:"#f4c430",
              border:"1px dashed #f4c430",borderRadius:5,
              padding:"1px 7px",fontSize:10,cursor:"pointer"}}>
            isolating · clear
          </button>
        )}
        <button onClick={downloadPng}
          style={{background:"var(--panel)", color:"var(--mut)",
            border:"1px solid var(--line)", borderRadius:5,
            padding:"1px 7px", fontSize:10, cursor:"pointer"}}>
          ↓ PNG
        </button>
      </div>
    </div>
  );
}
