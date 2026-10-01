// Generic dependency-free line + band chart used by the Landowner-yields and
// LANDIS-stratified tabs. Each series is { label, color, pts:[[x,lo,mid,hi]] };
// lo/hi may be null to draw a bare line. Optional per-series fields: dash (stroke
// dasharray), width (stroke width) and bandName (visible name for its shaded band).
// Inline SVG; chrome colors come from theme tokens so light and dark both read.
import { useEffect, useState } from "react";
import { fmtUnit } from "./units.js";

// House unit style inside a free-text label: "AGB (Mg/ha)" -> "AGB (Mg ha⁻¹)".
const fmtLabel = s => typeof s !== "string" ? s
  : s.replace(/(?<![A-Za-z])((?:\$|[A-Za-z]{1,3})(?: C)?)\/([A-Za-z]{1,3})(?:\/([A-Za-z]{1,3}))?(?![A-Za-z])/g, m => fmtUnit(m));
const niceStep = raw => { const mag = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; };

export default function MiniChart({ series, unit, xlabel = "Stand age (yr)", height = 230 }){
  // Viewbox follows the rendered width (320 to 640 px) so text stays at its 10 px floor.
  const [box, setBox] = useState(null);
  const [W, setW] = useState(460);
  useEffect(() => {
    if(!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => { const cw = Math.round(Math.min(e.contentRect.width, 640)); if(cw > 0) setW(Math.max(320, cw)); });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  const H = height + 10, P = { l: 50, r: 108, t: 34, b: 34 };
  const present = (series || []).filter(s => s.pts && s.pts.length);
  if(!present.length)
    return <div className="note" style={{margin:"8px 4px"}}>No series for this selection.</div>;
  let xmin = Infinity, xmax = -Infinity, ymax = -Infinity;
  present.forEach(s => s.pts.forEach(([x, lo, mid, hi]) => {
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
    ymax = Math.max(ymax, hi != null ? hi : mid);
  }));
  ymax = ymax * 1.05 || 1;
  // Round-number ticks from zero (magnitude axis); the top snaps to the next clean tick.
  const ystep = niceStep(ymax / 4);
  ymax = Math.ceil(ymax / ystep - 1e-9) * ystep;
  const ydec = ystep >= 1 ? 0 : ystep >= 0.1 ? 1 : 2;
  const sx = x => P.l + (xmax===xmin?0:(x - xmin)/(xmax - xmin)) * (W - P.l - P.r);
  const sy = v => H - P.b - (v / ymax) * (H - P.t - P.b);
  const yticks = []; for(let v = 0; v <= ymax + ystep*1e-6; v += ystep) yticks.push(+v.toFixed(6));
  const xticks = [];
  const step = (xmax - xmin) > 60 ? 20 : (xmax - xmin) > 25 ? 10 : 5;
  for(let x = Math.ceil(xmin/step)*step; x <= xmax; x += step) xticks.push(x);
  // Collision-avoided trailing labels in the right gutter, so each line is named in place
  // rather than relying on a separate legend (Cross-model ensemble had unlabeled lines).
  const endLabels = present.map(s => { const last = s.pts[s.pts.length-1];
    return { label: s.label, color: s.color, dash: s.dash, y: Math.max(P.t+4, Math.min(H-P.b-3, sy(last[2] != null ? last[2] : last[1]))) }; })
    .sort((a,b) => a.y - b.y);
  { let prev = -99; for(const it of endLabels){ it.ly = Math.max(it.y, prev + 12); prev = it.ly; }
    if(endLabels.length && endLabels[endLabels.length-1].ly > H-P.b-3){ let next = H-P.b-3+12;
      for(let i=endLabels.length-1;i>=0;i--){ endLabels[i].ly = Math.min(endLabels[i].ly, next-12); next = endLabels[i].ly; } } }
  // Visible name for every shaded band drawn.
  const bandNames = [...new Set(present.filter(s => s.pts.some(p => p[1]!=null && p[3]!=null))
    .map(s => s.bandName || "lo to hi band"))];

  return (
    <div ref={setBox} style={{width:"100%",maxWidth:640}}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block",maxWidth:640}}>
      <defs>
        <clipPath id="mc-plot">
          <rect x={P.l} y={P.t} width={Math.max(0,W-P.l-P.r)} height={Math.max(0,H-P.t-P.b)}/>
        </clipPath>
      </defs>
      {yticks.map((t, i) => (
        <g key={t}>
          <line x1={P.l} x2={W-P.r} y1={sy(t)} y2={sy(t)} className={i === 0 ? "ch-base" : "ch-grid"}/>
          <text x={P.l-6} y={sy(t)+3.5} textAnchor="end" className="ch-txt">{t.toFixed(ydec)}</text>
        </g>
      ))}
      {xticks.map(t => <text key={t} x={sx(t)} y={H-P.b+15} textAnchor="middle" className="ch-txt">{t}</text>)}
      <text x={(P.l+W-P.r)/2} y={H-4} textAnchor="middle" className="ch-txt">{fmtLabel(xlabel)}</text>
      {unit && <text x={P.l-6} y={13} textAnchor="start" className="ch-ttl">{fmtLabel(unit)}</text>}
      {bandNames.length > 0 && <text x={P.l-6} y={27} textAnchor="start" className="ch-note">shaded: {bandNames.join(", ")}</text>}
      <g clipPath="url(#mc-plot)">
      {present.map(s => {
        const band = s.pts.filter(p => p[1]!=null && p[3]!=null);
        const bandD = band.length
          ? "M" + band.map(([x,lo]) => `${sx(x).toFixed(1)} ${sy(lo).toFixed(1)}`).join(" L")
            + " L" + band.slice().reverse().map(([x,,,hi]) => `${sx(x).toFixed(1)} ${sy(hi).toFixed(1)}`).join(" L") + " Z"
          : null;
        const lineD = "M" + s.pts.map(([x,,mid]) => `${sx(x).toFixed(1)} ${sy(mid).toFixed(1)}`).join(" L");
        return (
          <g key={s.label}>
            {bandD && <path d={bandD} style={{fill:s.color}} opacity="0.14"/>}
            <path d={lineD} fill="none" style={{stroke:s.color}} strokeWidth={s.width || 1.8}
              strokeDasharray={s.dash || undefined} strokeLinejoin="round"/>
          </g>
        );
      })}
      </g>
      {endLabels.map((it,i) => (
        <g key={"el"+i}>
          <line x1={W-P.r+1} y1={it.ly} x2={W-P.r+6} y2={it.ly} style={{stroke:it.color}} strokeWidth="1.8"
            strokeDasharray={it.dash ? "2 1.5" : undefined}/>
          <text x={W-P.r+9} y={it.ly+3.5} className="ch-txt" style={{fill:it.color}}>
            {String(it.label).replace(/ \(90% band\)/,"").slice(0,17)}<title>{it.label}</title></text>
        </g>
      ))}
    </svg>
    </div>
  );
}
