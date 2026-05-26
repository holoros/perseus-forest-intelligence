// Lightweight dependency-free SVG growth-curve chart with optional
// uncertainty ribbons (CEM lo/hi, FVS q10/q90 -> pts of [yr, med, lo, hi]).
export default function GrowthChart({ node, fiaRef, fiaYear, unit, classCol, showBands }){
  const W=560,H=320,L=48,R=14,T=14,B=30;
  if(!node || !node.length) return <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto"}}/>;
  const xs=[], ys=[];
  node.forEach(s=> s.pts.forEach(p=>{ xs.push(p[0]); ys.push(p[1]);
    if(showBands && p.length>=4){ ys.push(p[2]); ys.push(p[3]); } }));
  if(fiaRef!=null) ys.push(fiaRef);
  const x0=Math.min(...xs), x1=Math.max(...xs), y1=Math.max(...ys)*1.05 || 1;
  const X=v=> L+(v-x0)/((x1-x0)||1)*(W-L-R);
  const Y=v=> (H-B)-(v-0)/(y1)*(H-T-B);
  const grid=[]; for(let i=0;i<=4;i++){ const v=y1*i/4, yy=Y(v);
    grid.push(<g key={"g"+i}>
      <line x1={L} y1={yy} x2={W-R} y2={yy} stroke="#2a3a47" strokeWidth="1"/>
      <text x={L-6} y={yy+3} textAnchor="end" fill="#8aa0b0" fontSize="10">{Math.round(v)}</text>
    </g>); }
  const xticks=[]; for(let t=Math.ceil(x0/20)*20; t<=x1; t+=20)
    xticks.push(<text key={"x"+t} x={X(t)} y={H-B+16} textAnchor="middle" fill="#8aa0b0" fontSize="10">{t}</text>);
  // uncertainty ribbons (drawn first, under the lines)
  const bands = showBands ? node.filter(s=> s.pts.some(p=>p.length>=4)).map((s,i)=>{
    const col = classCol[s.cls] || "#bbb";
    const bp = s.pts.filter(p=>p.length>=4);
    const up = bp.map((p,k)=> (k?"L":"M") + X(p[0]).toFixed(1) + " " + Y(p[3]).toFixed(1)).join(" ");
    const dn = bp.slice().reverse().map(p=> "L" + X(p[0]).toFixed(1) + " " + Y(p[2]).toFixed(1)).join(" ");
    return <path key={"b"+i} d={up+" "+dn+" Z"} fill={col} opacity="0.12" stroke="none"/>;
  }) : null;
  const lines = node.map((s,i)=>{
    const col = classCol[s.cls] || "#bbb";
    const d = s.pts.map((p,k)=> (k? "L":"M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
    const last = s.pts[s.pts.length-1];
    return <g key={i}>
      {/* wide invisible hit-path so the hover tooltip is easy to trigger */}
      <path d={d} fill="none" stroke="transparent" strokeWidth="9"><title>{`${s.label} (${s.cls})`}</title></path>
      <path d={d} fill="none" stroke={col} strokeWidth="1.8" opacity="0.92" style={{pointerEvents:"none"}}/>
      <text x={X(last[0])+3} y={Y(last[1])+3} fill={col} fontSize="8" style={{pointerEvents:"none"}}>{s.model.replace(/_/g," ").slice(0,16)}</text>
    </g>;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
      {grid}{xticks}{bands}
      {fiaRef!=null && <>
        <line x1={L} y1={Y(fiaRef)} x2={W-R} y2={Y(fiaRef)} stroke="#9fb3c0" strokeDasharray="5 4" strokeWidth="1"/>
        <text x={L+4} y={Y(fiaRef)-4} fill="#8aa0b0" fontSize="10">FIA observed {fiaRef} Tg{fiaYear?` (${fiaYear})`:""}</text>
      </>}
      {lines}
      <text x={L} y={T} fill="#8aa0b0" fontSize="10">{unit||""}</text>
    </svg>
  );
}
