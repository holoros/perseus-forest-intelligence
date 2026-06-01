// Stumpage price panel. Reconstructed into source (v1.3 parity) from
// api/stumpage.json (TimberMart South + state agencies, 120k obs 1977-2026).
// Sawlog buckets in $/MBF, pulpwood buckets in $/cord; median line with a
// low-high (q25-q75) band per bucket. Real $ (CPI-U, base 2024) by default,
// nominal optional. Dependency-free inline SVG.
import { useState } from "react";

const BUCKET_COL = {
  sawlog_softwood:  "#3fb68b",
  sawlog_hardwood:  "#e6ab02",
  pulpwood_softwood:"#6baed6",
  pulpwood_hardwood:"#d95f02",
};
const BUCKET_LABEL = {
  sawlog_softwood:  "Sawlog · softwood",
  sawlog_hardwood:  "Sawlog · hardwood",
  pulpwood_softwood:"Pulpwood · softwood",
  pulpwood_hardwood:"Pulpwood · hardwood",
};

// Compact multi-series line+band chart. rows = [year, low, median, high, n].
function PriceChart({ series, buckets, unit, title }){
  const W = 440, H = 200, P = { l: 44, r: 12, t: 14, b: 24 };
  const present = buckets.filter(b => series[b] && series[b].length);
  if(!present.length)
    return <div className="note" style={{margin:"8px 4px"}}>No {title.toLowerCase()} series for this state.</div>;
  let xmin = Infinity, xmax = -Infinity, ymax = -Infinity;
  present.forEach(b => series[b].forEach(([yr, lo, md, hi]) => {
    xmin = Math.min(xmin, yr); xmax = Math.max(xmax, yr);
    ymax = Math.max(ymax, hi != null ? hi : md);
  }));
  ymax = ymax * 1.05 || 1;
  const sx = yr => P.l + (xmax===xmin?0:(yr - xmin)/(xmax - xmin)) * (W - P.l - P.r);
  const sy = v  => H - P.b - (v / ymax) * (H - P.t - P.b);
  const yticks = [0, 0.25, 0.5, 0.75, 1].map(f => +(ymax * f).toFixed(0));
  const xticks = [];
  for(let y = Math.ceil(xmin/10)*10; y <= xmax; y += 10) xticks.push(y);

  return (
    <div style={{marginBottom:6}}>
      <div style={{fontSize:11.5,color:"var(--mut)",margin:"4px 0 2px 4px"}}>{title} <span style={{opacity:.7}}>({unit})</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        {yticks.map(t => (
          <g key={t}>
            <line x1={P.l} x2={W-P.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth="0.5"/>
            <text x={P.l-6} y={sy(t)+3} textAnchor="end" fontSize="9" fill="var(--mut)">{t}</text>
          </g>
        ))}
        {xticks.map(t => (
          <text key={t} x={sx(t)} y={H-8} textAnchor="middle" fontSize="9" fill="var(--mut)">{t}</text>
        ))}
        {present.map(b => {
          const col = BUCKET_COL[b] || "#aaa";
          const pts = series[b];
          const band = pts.filter(p => p[1]!=null && p[3]!=null);
          const bandD = band.length
            ? "M" + band.map(([yr,lo]) => `${sx(yr).toFixed(1)} ${sy(lo).toFixed(1)}`).join(" L")
              + " L" + band.slice().reverse().map(([yr,,,hi]) => `${sx(yr).toFixed(1)} ${sy(hi).toFixed(1)}`).join(" L") + " Z"
            : null;
          const lineD = "M" + pts.map(([yr,,md]) => `${sx(yr).toFixed(1)} ${sy(md).toFixed(1)}`).join(" L");
          return (
            <g key={b}>
              {bandD && <path d={bandD} fill={col} opacity="0.13"/>}
              <path d={lineD} fill="none" stroke={col} strokeWidth="1.6"/>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function StumpagePanel({ data, state }){
  const [real, setReal] = useState(true);
  if(!data || !data.meta)
    return <div className="empty">Stumpage data not loaded.</div>;
  const avail = data.meta.states || [];
  const src = real ? data.series_real : data.series;
  const stSeries = src && src[state];
  if(!stSeries)
    return (
      <div>
        <div className="empty">No stumpage series for {state}.</div>
        <div className="note">Stumpage covers {avail.length} states: {avail.join(", ")}.
          Pick one of those to see prices.</div>
      </div>
    );
  return (
    <div>
      <div className="controls" style={{marginTop:0}}>
        <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--mut)"}}>
          <input type="checkbox" checked={real} onChange={e=>setReal(e.target.checked)}/>
          real $ (CPI-U, base {data.meta.cpi_base_year})
        </label>
        <span style={{color:"var(--mut)",fontSize:12,alignSelf:"center"}}>
          {data.meta.year_min}–{data.meta.year_max} · {Number(data.meta.rows_kept).toLocaleString()} obs
        </span>
      </div>
      <div className="chartcard" style={{padding:"6px 8px"}}>
        <PriceChart series={stSeries} buckets={["sawlog_softwood","sawlog_hardwood"]}
          unit={data.meta.units.sawlog} title="Sawlog"/>
        <PriceChart series={stSeries} buckets={["pulpwood_softwood","pulpwood_hardwood"]}
          unit={data.meta.units.pulpwood} title="Pulpwood"/>
      </div>
      <div className="lgd" style={{marginTop:8}}>
        {Object.keys(BUCKET_LABEL).filter(b => stSeries[b] && stSeries[b].length).map(b => (
          <span key={b}><i style={{background:BUCKET_COL[b],width:14,height:3}}/>{BUCKET_LABEL[b]}</span>
        ))}
      </div>
      <div className="note">
        Median price (solid) with the q25 to q75 band (shaded). {real ? "Real" : "Nominal"} dollars
        {real && `, deflated by BLS CPI-U to ${data.meta.cpi_base_year}`}. Source: {data.meta.source}.
        Toggle to {real ? "nominal" : "real"} above. Data: api/stumpage.json.
      </div>
    </div>
  );
}
