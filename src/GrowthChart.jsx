// Lightweight dependency-free SVG growth-curve chart.
// v0.70 interactions: hover scrubber with per-engine values, click-to-isolate,
// download-as-PNG button.
import { useRef, useState } from "react";

export default function GrowthChart({ node, fiaRef, fiaYear, unit, classCol,
                                      showBands, showInvBand, hiddenEngines, yMode,
                                      overlayNode, overlayLabel,
                                      isolatedEngine, onIsolate }){
  const W=560,H=320,L=48,R=14,T=14,B=30;
  const svgRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);

  const visible = (node||[]).filter(s=> !hiddenEngines || !hiddenEngines.has(s.model));
  const visibleOverlay = (overlayNode||[]).filter(s=> !hiddenEngines || !hiddenEngines.has(s.model));
  // When an engine is isolated, only that engine's line draws — but keep the
  // full set in `visible` so hovers can re-display values for the others.
  const drawSet = isolatedEngine
    ? visible.filter(s => s.model === isolatedEngine)
    : visible;
  const drawOverlay = isolatedEngine ? [] : visibleOverlay;

  if(!visible.length && !visibleOverlay.length)
    return <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto"}}/>;
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
    const start = Math.ceil(y0 / step) * step;
    for(let v = start; v <= y1 + step*1e-6; v += step) yticks.push(+v.toFixed(6));
    if(yticks.length < 2) yticks = [y0, y1];
  }
  const ydec = (yMode!=="log" && yticks.length>1 && (yticks[1]-yticks[0]) < 1) ? 1 : 0;
  yticks.forEach((v,i)=>{
    const yy=Y(v);
    grid.push(<g key={"g"+i}>
      <line x1={L} y1={yy} x2={W-R} y2={yy} stroke="#2a3a47" strokeWidth="1"/>
      <text x={L-6} y={yy+3} textAnchor="end" fill="#8aa0b0" fontSize="10">
        {v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(ydec)}
      </text>
    </g>);
  });
  const xticks=[]; for(let t=Math.ceil(x0/20)*20; t<=x1; t+=20)
    xticks.push(<text key={"x"+t} x={X(t)} y={H-B+16} textAnchor="middle" fill="#8aa0b0" fontSize="10">{t}</text>);
  const bands = showBands ? visible.filter(s=> s.pts.some(p=>p.length>=4)).map((s,i)=>{
    const col = classCol[s.cls] || "#bbb";
    const bp = s.pts.filter(p=>p.length>=4);
    const up = bp.map((p,k)=> (k?"L":"M") + X(p[0]).toFixed(1) + " " + Y(p[3]).toFixed(1)).join(" ");
    const dn = bp.slice().reverse().map(p=> "L" + X(p[0]).toFixed(1) + " " + Y(p[2]).toFixed(1)).join(" ");
    return <path key={"b"+i} d={up+" "+dn+" Z"} fill={col} opacity="0.12" stroke="none"/>;
  }) : null;
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
  const drawLine = (s, i, dashed) => {
    const col = classCol[s.cls] || "#bbb";
    const d = s.pts.map((p,k)=> (k? "L":"M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
    const last = s.pts[s.pts.length-1];
    const tag = dashed ? `${s.label} · ${overlayLabel||"compare"}` : `${s.label}`;
    return <g key={(dashed?"o":"")+i}>
      <path d={d} fill="none" stroke="transparent" strokeWidth="9"
            style={{cursor:"pointer"}}
            onClick={()=> !dashed && onIsolate && onIsolate(s.model)}>
        <title>{`${tag} (${s.cls}) — click to isolate`}</title>
      </path>
      <path d={d} fill="none" stroke={col} strokeWidth={dashed?1.6:1.8}
            opacity={dashed?0.7:0.92}
            strokeDasharray={dashed?"4 4":"0"}
            style={{pointerEvents:"none"}}/>
      <text x={X(last[0])+3} y={Y(last[1])+3} fill={col} fontSize="8"
            opacity={dashed?0.7:1} style={{pointerEvents:"none"}}>
        {s.model.replace(/_/g," ").slice(0,16)}{dashed?"·"+overlayLabel:""}
      </text>
    </g>;
  };

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
        {drawSet.map((s,i)=> drawLine(s, i, false))}
        {drawOverlay.map((s,i)=> drawLine(s, i, true))}
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
            const col = classCol[s.cls] || "#bbb";
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
