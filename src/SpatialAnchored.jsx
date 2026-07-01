// FIADB-anchored LANDIS spatial biomass tab.
// Renders the per-state reserve aboveground-carbon trajectory (2025-2100) from the
// LANDIS-II statewide spatial runs whose year-0 is anchored to the FIADB design-based
// state total and validated from the LANDIS spp-biomass log.
// Data: api/spatial_biomass_anchored.json  (built by the ic_rebuild pipeline).
import { useState } from "react";

export default function SpatialAnchored({ data, state }){
  const states = (data && data.states) || null;
  const avail = states ? Object.keys(states) : [];
  const [pick, setPick] = useState(state && states && states[state] ? state : (avail[0] || ""));
  const st = (pick && states && states[pick]) ? pick : (avail[0] || "");
  const rec = st && states ? states[st] : null;

  if(!states) return <div className="note" style={{padding:12}}>No anchored spatial data loaded.</div>;

  // build the series arrays
  const series = rec ? Object.entries(rec.series).map(([y,v])=>({ year:+y, tgc:v.total_TgC, mgc:v.mean_MgC_ha })) : [];
  const W=620, H=300, pad=48;
  const xs = series.map(s=>s.year), ys = series.map(s=>s.mgc);
  const xmin=Math.min(...xs), xmax=Math.max(...xs);
  const ymax=Math.max(...ys)*1.08, ymin=0;
  const X = y => pad + (y-xmin)/(xmax-xmin)*(W-pad-12);
  const Y = v => H-pad - (v-ymin)/(ymax-ymin)*(H-pad-16);
  const path = series.map((s,i)=> (i?"L":"M")+X(s.year).toFixed(1)+" "+Y(s.mgc).toFixed(1)).join(" ");

  return (
    <div style={{padding:12}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}}>
        <strong>Spatial biomass (FIADB-anchored LANDIS-II)</strong>
        <span className="note">state:</span>
        <select value={st} onChange={e=>setPick(e.target.value)}>
          {avail.map(s=> <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {rec && (
        <div className="note" style={{marginBottom:8}}>
          Reserve (no-harvest) scenario, climate {rec.climate}. Year-0 aboveground biomass anchored to
          the FIADB design-based state total: <strong>{rec.year0_AGB_Tg} Tg</strong> vs control{" "}
          <strong>{rec.control_AGB_Tg} Tg</strong> ({rec.pct_diff>0?"+":""}{rec.pct_diff}%). Carbon
          {" "}{rec.start_TgC} to {rec.end_TgC} TgC, 2025 to 2100.
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,height:"auto"}} role="img"
           aria-label={`${st} spatial reserve carbon density trajectory`}>
        <line x1={pad} y1={H-pad} x2={W-12} y2={H-pad} stroke="var(--line,#ccc)"/>
        <line x1={pad} y1={16} x2={pad} y2={H-pad} stroke="var(--line,#ccc)"/>
        {series.length>1 && <path d={path} fill="none" stroke="var(--accent,#1b7837)" strokeWidth="2.4"/>}
        {series.map(s=> <circle key={s.year} cx={X(s.year)} cy={Y(s.mgc)} r="3" fill="var(--accent,#1b7837)"/>)}
        <text x={pad} y={12} fontSize="12" fill="var(--fg,#333)">mean AGC (MgC/ha)</text>
        <text x={W-12} y={H-pad+18} fontSize="11" fill="var(--fg,#666)" textAnchor="end">{xmax}</text>
        <text x={pad} y={H-pad+18} fontSize="11" fill="var(--fg,#666)">{xmin}</text>
        <text x={pad-6} y={Y(ymax)+4} fontSize="11" fill="var(--fg,#666)" textAnchor="end">{ymax.toFixed(0)}</text>
        <text x={pad-6} y={H-pad} fontSize="11" fill="var(--fg,#666)" textAnchor="end">0</text>
      </svg>
      <div className="note" style={{marginTop:8}}>
        Data: api/spatial_biomass_anchored.json. LANDIS-II statewide runs at 270 m, initial communities
        built from TreeMap 2022 and FIA, per-cohort biomass apportioned from FIA DRYBIO and anchored to
        the FIADB design-based state aboveground total; succession caps (BiomassMax, ANPP) calibrated to
        FIA observed per-species maxima. Available for {avail.join(", ")}.
      </div>
    </div>
  );
}
