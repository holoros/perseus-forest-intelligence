// Lightweight dependency-free SVG growth-curve chart with optional
// uncertainty ribbons, per-engine hide, log/auto-zoom y axis, and a
// second-state overlay (drawn dashed).
export default function GrowthChart({ node, fiaRef, fiaYear, unit, classCol,
                                      showBands, hiddenEngines, yMode,
                                      overlayNode, overlayLabel }){
  const W=560,H=320,L=48,R=14,T=14,B=30;
  const visible = (node||[]).filter(s=> !hiddenEngines || !hiddenEngines.has(s.model));
  const visibleOverlay = (overlayNode||[]).filter(s=> !hiddenEngines || !hiddenEngines.has(s.model));
  if(!visible.length && !visibleOverlay.length) return <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto"}}/>;
  const xs=[], ys=[];
  const collectPts = (arr) => arr.forEach(s=> s.pts.forEach(p=>{
    xs.push(p[0]); ys.push(p[1]);
    if(showBands && p.length>=4){ ys.push(p[2]); ys.push(p[3]); } }));
  collectPts(visible); collectPts(visibleOverlay);
  if(fiaRef!=null) ys.push(fiaRef);
  const x0=Math.min(...xs), x1=Math.max(...xs);
  // y-axis modes: "full" (default), "auto" (zoom to IQR), "log" (logarithmic)
  let y0=0, y1=Math.max(...ys)*1.05 || 1;
  if(yMode === "auto" && ys.length > 4){
    const sorted = ys.slice().sort((a,b)=>a-b);
    const q1 = sorted[Math.floor(sorted.length*0.10)];
    const q3 = sorted[Math.floor(sorted.length*0.90)];
    const pad = (q3-q1)*0.25;
    y0 = Math.max(0, q1-pad);
    y1 = q3+pad;
  }
  const X=v=> L+(v-x0)/((x1-x0)||1)*(W-L-R);
  let Y;
  if(yMode === "log"){
    const ly0 = Math.log10(Math.max(0.1, y0||0.1));
    const ly1 = Math.log10(Math.max(y1, 1));
    Y = v => (H-B) - (Math.log10(Math.max(0.1, v))-ly0)/((ly1-ly0)||1)*(H-T-B);
  } else {
    Y = v => (H-B) - (v-y0)/((y1-y0)||1)*(H-T-B);
  }
  const grid=[]; const nTicks = yMode==="log" ? 4 : 4;
  for(let i=0;i<=nTicks;i++){
    let v;
    if(yMode==="log"){
      const ly0 = Math.log10(Math.max(0.1, y0||0.1));
      const ly1 = Math.log10(Math.max(y1, 1));
      v = Math.pow(10, ly0 + (ly1-ly0)*i/nTicks);
    } else {
      v = y0 + (y1-y0)*i/nTicks;
    }
    const yy=Y(v);
    grid.push(<g key={"g"+i}>
      <line x1={L} y1={yy} x2={W-R} y2={yy} stroke="#2a3a47" strokeWidth="1"/>
      <text x={L-6} y={yy+3} textAnchor="end" fill="#8aa0b0" fontSize="10">
        {v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(v>=10?0:1)}
      </text>
    </g>);
  }
  const xticks=[]; for(let t=Math.ceil(x0/20)*20; t<=x1; t+=20)
    xticks.push(<text key={"x"+t} x={X(t)} y={H-B+16} textAnchor="middle" fill="#8aa0b0" fontSize="10">{t}</text>);
  const bands = showBands ? visible.filter(s=> s.pts.some(p=>p.length>=4)).map((s,i)=>{
    const col = classCol[s.cls] || "#bbb";
    const bp = s.pts.filter(p=>p.length>=4);
    const up = bp.map((p,k)=> (k?"L":"M") + X(p[0]).toFixed(1) + " " + Y(p[3]).toFixed(1)).join(" ");
    const dn = bp.slice().reverse().map(p=> "L" + X(p[0]).toFixed(1) + " " + Y(p[2]).toFixed(1)).join(" ");
    return <path key={"b"+i} d={up+" "+dn+" Z"} fill={col} opacity="0.12" stroke="none"/>;
  }) : null;
  const drawLine = (s, i, dashed) => {
    const col = classCol[s.cls] || "#bbb";
    const d = s.pts.map((p,k)=> (k? "L":"M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
    const last = s.pts[s.pts.length-1];
    const tag = dashed ? `${s.label} · ${overlayLabel||"compare"}` : `${s.label}`;
    return <g key={(dashed?"o":"")+i}>
      <path d={d} fill="none" stroke="transparent" strokeWidth="9"><title>{`${tag} (${s.cls})`}</title></path>
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
      {grid}{xticks}{bands}
      {fiaRef!=null && fiaRef >= y0 && fiaRef <= y1 && <>
        <line x1={L} y1={Y(fiaRef)} x2={W-R} y2={Y(fiaRef)} stroke="#9fb3c0" strokeDasharray="5 4" strokeWidth="1"/>
        <text x={L+4} y={Y(fiaRef)-4} fill="#8aa0b0" fontSize="10">FIA observed {fiaRef} Tg{fiaYear?` (${fiaYear})`:""}</text>
      </>}
      {visible.map((s,i)=> drawLine(s, i, false))}
      {visibleOverlay.map((s,i)=> drawLine(s, i, true))}
      <text x={L} y={T} fill="#8aa0b0" fontSize="10">{unit||""}</text>
    </svg>
  );
}
