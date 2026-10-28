// FIADB-anchored LANDIS spatial biomass tab.
// Renders the per-state reserve aboveground-carbon trajectory (2025-2100) from the
// LANDIS-II statewide spatial runs whose year-0 is anchored to the FIADB design-based
// state total and validated from the LANDIS spp-biomass log.
// Data: api/spatial_biomass_anchored.json  (built by the ic_rebuild pipeline).
import { useEffect, useState } from "react";
import { fmtUnit } from "./units.js";

const niceStep = raw => { const mag = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; };

export default function SpatialAnchored({ data, state }){
  const states = (data && data.states) || null;
  const avail = states ? Object.keys(states) : [];
  const [pick, setPick] = useState(state && states && states[state] ? state : (avail[0] || ""));
  // Viewbox follows the rendered width so axis text holds its 10 px floor.
  const [box, setBox] = useState(null);
  const [W, setW] = useState(620);
  useEffect(() => {
    if(!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => { const cw = Math.round(Math.min(e.contentRect.width, 620)); if(cw > 0) setW(Math.max(320, cw)); });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  const st = (pick && states && states[pick]) ? pick : (avail[0] || "");
  const rec = st && states ? states[st] : null;

  if(!states) return <div className="note" style={{padding:12}}>No anchored spatial data loaded.</div>;

  // build the series arrays
  const series = rec ? Object.entries(rec.series).map(([y,v])=>({ year:+y, tgc:v.total_TgC, mgc:v.mean_MgC_ha })) : [];
  const H=300, L=52, R=16, T=24, B=36;
  const xs = series.map(s=>s.year), ys = series.map(s=>s.mgc);
  const xmin=Math.min(...xs), xmax=Math.max(...xs);
  const ystep = niceStep(Math.max(...ys)*1.08/4);
  const ymax=Math.ceil(Math.max(...ys)*1.08/ystep - 1e-9)*ystep, ymin=0;
  const X = y => L + (y-xmin)/((xmax-xmin)||1)*(W-L-R);
  const Y = v => H-B - (v-ymin)/((ymax-ymin)||1)*(H-B-T);
  const path = series.map((s,i)=> (i?"L":"M")+X(s.year).toFixed(1)+" "+Y(s.mgc).toFixed(1)).join(" ");
  const yt = []; if(isFinite(ymax)) for(let v=0; v<=ymax+ystep*1e-6; v+=ystep) yt.push(+v.toFixed(6));
  const xstep = (xmax-xmin) > 50 ? 25 : 10;
  const xt = []; if(isFinite(xmin)) for(let t=Math.ceil(xmin/xstep)*xstep; t<=xmax; t+=xstep) xt.push(t);

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
          {" "}{rec.start_TgC} to {rec.end_TgC} {fmtUnit("Tg C")}, 2025 to 2100.
        </div>
      )}
      <div ref={setBox} style={{width:"100%",maxWidth:620}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:620,height:"auto",display:"block"}} role="img"
           aria-label={`${st} spatial reserve carbon density trajectory`}>
        {yt.map((v,i)=>(<g key={"y"+v}>
          <line x1={L} y1={Y(v)} x2={W-R} y2={Y(v)} className={i===0 ? "ch-base" : "ch-grid"}/>
          <text x={L-6} y={Y(v)+3.5} className="ch-txt" textAnchor="end">{v.toFixed(0)}</text>
        </g>))}
        {xt.map(t=> <text key={"x"+t} x={X(t)} y={H-B+15} className="ch-txt" textAnchor="middle">{t}</text>)}
        <text x={(L+W-R)/2} y={H-4} className="ch-txt" textAnchor="middle">Year</text>
        {series.length>1 && <path d={path} fill="none" style={{stroke:"var(--accent)"}} strokeWidth="2.4" strokeLinejoin="round"/>}
        {series.map(s=> <circle key={s.year} cx={X(s.year)} cy={Y(s.mgc)} r="3" style={{fill:"var(--accent)"}}>
          <title>{`${s.year}: ${s.mgc} ${fmtUnit("Mg C/ha")}`}</title></circle>)}
        <text x={L-6} y={13} className="ch-ttl">Mean aboveground carbon ({fmtUnit("Mg C/ha")})</text>
      </svg>
      </div>
      <div className="note" style={{marginTop:8}}>
        Data: api/spatial_biomass_anchored.json. LANDIS-II statewide runs at 270 m, initial communities
        built from TreeMap 2022 and FIA, per-cohort biomass apportioned from FIA DRYBIO and anchored to
        the FIADB design-based state aboveground total; succession caps (BiomassMax, ANPP) calibrated to
        FIA observed per-species maxima. Available for {avail.join(", ")}.
      </div>
    </div>
  );
}
