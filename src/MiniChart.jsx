// Generic dependency-free line + band chart used by the Landowner-yields and
// LANDIS-stratified tabs. Each series is { label, color, pts:[[x,lo,mid,hi]] };
// lo/hi may be null to draw a bare line. Inline SVG, dark-theme aware.
export default function MiniChart({ series, unit, xlabel = "Stand age (yr)", height = 230 }){
  const W = 460, H = height, P = { l: 46, r: 12, t: 12, b: 26 };
  const present = (series || []).filter(s => s.pts && s.pts.length);
  if(!present.length)
    return <div className="note" style={{margin:"8px 4px"}}>No series for this selection.</div>;
  let xmin = Infinity, xmax = -Infinity, ymax = -Infinity;
  present.forEach(s => s.pts.forEach(([x, lo, mid, hi]) => {
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
    ymax = Math.max(ymax, hi != null ? hi : mid);
  }));
  ymax = ymax * 1.05 || 1;
  const sx = x => P.l + (xmax===xmin?0:(x - xmin)/(xmax - xmin)) * (W - P.l - P.r);
  const sy = v => H - P.b - (v / ymax) * (H - P.t - P.b);
  const yticks = [0, 0.25, 0.5, 0.75, 1].map(f => +(ymax * f).toFixed(ymax<10?1:0));
  const xticks = [];
  const step = (xmax - xmin) > 60 ? 20 : (xmax - xmin) > 25 ? 10 : 5;
  for(let x = Math.ceil(xmin/step)*step; x <= xmax; x += step) xticks.push(x);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
      {yticks.map(t => (
        <g key={t}>
          <line x1={P.l} x2={W-P.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth="0.5"/>
          <text x={P.l-6} y={sy(t)+3} textAnchor="end" fontSize="9" fill="var(--mut)">{t}</text>
        </g>
      ))}
      {xticks.map(t => <text key={t} x={sx(t)} y={H-8} textAnchor="middle" fontSize="9" fill="var(--mut)">{t}</text>)}
      <text x={(P.l+W-P.r)/2} y={H-0.5} textAnchor="middle" fontSize="9" fill="var(--mut)">{xlabel}</text>
      {unit && <text x={W-P.r} y={P.t+1} textAnchor="end" fontSize="9" fill="var(--mut)">{unit}</text>}
      {present.map(s => {
        const band = s.pts.filter(p => p[1]!=null && p[3]!=null);
        const bandD = band.length
          ? "M" + band.map(([x,lo]) => `${sx(x).toFixed(1)} ${sy(lo).toFixed(1)}`).join(" L")
            + " L" + band.slice().reverse().map(([x,,,hi]) => `${sx(x).toFixed(1)} ${sy(hi).toFixed(1)}`).join(" L") + " Z"
          : null;
        const lineD = "M" + s.pts.map(([x,,mid]) => `${sx(x).toFixed(1)} ${sy(mid).toFixed(1)}`).join(" L");
        return (
          <g key={s.label}>
            {bandD && <path d={bandD} fill={s.color} opacity="0.12"/>}
            <path d={lineD} fill="none" stroke={s.color} strokeWidth="1.7"/>
          </g>
        );
      })}
    </svg>
  );
}
