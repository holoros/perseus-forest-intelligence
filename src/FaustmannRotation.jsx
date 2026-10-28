// Faustmann-rotation tab (Maine). Reconstructed from api/faustmann_rotation.json.
// Optimal rotation age (R_opt) and soil expectation value (SEV) by forest type,
// ecoregion and owner, with an optional carbon-floor constraint. Scatter of
// R_opt vs SEV colored by forest type, plus the underlying table.
import { useState } from "react";
import { fmtUnit } from "./units.js";
import { FAUSTMANN_FT_COL } from "./palette.js";
import useWidth from "./useWidth.js";

// Okabe-Ito forest-type colors from the shared palette.
const col = ft => FAUSTMANN_FT_COL[ft] || "var(--context)";
const niceStep = raw => { const mag = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; };

function Scatter({ rows }){
  // Viewbox follows the rendered width so axis text holds its size on screen.
  const [setBox, W] = useWidth(460, 320, 720);
  const H = 250, P = { l: 56, r: 14, t: 34, b: 36 };
  if(!rows.length) return <div className="note" style={{margin:"8px 4px"}}>No rows for this selection.</div>;
  const xs = rows.map(r=>r.R_opt), ys = rows.map(r=>r.sev_opt);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(0, ...ys);
  let ymax = Math.max(...ys) * 1.05 || 1;
  const ystep = niceStep((ymax - ymin) / 4);
  ymax = Math.ceil(ymax / ystep - 1e-9) * ystep;
  const sx = x => P.l + (xmax===xmin?0.5:(x-xmin)/(xmax-xmin)) * (W-P.l-P.r);
  const sy = v => H - P.b - (ymax===ymin?0:(v-ymin)/(ymax-ymin)) * (H-P.t-P.b);
  const xstep = W < 480 ? 20 : 10;
  const xt = []; for(let x=Math.ceil(xmin/xstep)*xstep; x<=xmax; x+=xstep) xt.push(x);
  const yt = []; for(let v = Math.ceil(ymin/ystep)*ystep; v <= ymax + ystep*1e-6; v += ystep) yt.push(+v.toFixed(6));
  return (
    <div ref={setBox} style={{width:"100%"}}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
      {yt.map(t => (<g key={t}>
        <line x1={P.l} x2={W-P.r} y1={sy(t)} y2={sy(t)} className={t === 0 ? "ch-base" : "ch-grid"}/>
        <text x={P.l-6} y={sy(t)+3.5} textAnchor="end" className="ch-txt">{t.toLocaleString()}</text>
      </g>))}
      {xt.map(t => <text key={t} x={sx(t)} y={H-P.b+15} textAnchor="middle" className="ch-txt">{t}</text>)}
      <text x={(P.l+W-P.r)/2} y={H-4} textAnchor="middle" className="ch-txt">Optimal rotation age (yr), axis zoomed to data</text>
      <text x={P.l-6} y={13} textAnchor="start" className="ch-ttl">Soil expectation value, SEV ({fmtUnit("$/ac")})</text>
      <text x={P.l-6} y={27} textAnchor="start" className="ch-note">{W<480 ? "solid: no carbon floor; outlined: carbon floor" : "small solid points: no carbon floor; large outlined points: carbon floor"}</text>
      {rows.map((r,i) => (
        <circle key={i} cx={sx(r.R_opt)} cy={sy(r.sev_opt)} r={r.carbon_floor>0?5:3.4}
          fillOpacity={r.carbon_floor>0?0.55:0.9}
          strokeWidth={r.carbon_floor>0?1:0}
          style={{fill:col(r.ft), stroke:r.carbon_floor>0?"var(--ink)":"none"}}>
          <title>{`${r.ft}, ${r.eco}, ${r.owner}\noptimal rotation ${r.R_opt} yr, SEV $${r.sev_opt.toFixed(0)} ${fmtUnit("per ac")}\ncarbon floor ${r.carbon_floor} tons AGB ac⁻¹ (rotation mean), volume at rotation ${r.vol_at_R} ft³ ac⁻¹`}</title>
        </circle>
      ))}
    </svg>
    </div>
  );
}

export default function FaustmannRotation({ data, state, stateName }){
  const rowsAll = (data && data[state]) || [];
  const owners = [...new Set(rowsAll.map(r=>r.owner))].sort();
  const treatments = [...new Set(rowsAll.map(r=>r.treatment))].sort();
  const [owner, setOwner] = useState("all");
  const [treatment, setTreatment] = useState(treatments[0] || "all");
  if(!data || !data.meta) return <div className="empty">Faustmann data not loaded.</div>;
  if(!rowsAll.length)
    return <div><div className="empty">No Faustmann rotation rows for {state}.</div>
      <div className="note">Faustmann optimal-rotation runs cover {data.meta.state} only.</div></div>;

  const rows = rowsAll.filter(r => (owner==="all"||r.owner===owner) && (treatment==="all"||r.treatment===treatment));
  // Cost of the carbon floor, paired within each forest type x ecoregion x owner x
  // treatment cell: every floored row is compared with the same cell's no-floor row,
  // so the cell mix cannot drive the difference.
  const cellKey = r => `${r.ft}|${r.eco}|${r.owner}|${r.treatment}`;
  const base = new Map(rows.filter(r=>r.carbon_floor===0).map(r=>[cellKey(r), r]));
  const pairs = rows.filter(r=>r.carbon_floor>0 && base.has(cellKey(r))).map(r => {
    const b = base.get(cellKey(r));
    const dSEV = b.sev_opt - r.sev_opt, dAGB = r.mean_agb - b.mean_agb;
    return { dR: r.R_opt - b.R_opt, dSEV, dAGB, ratio: dAGB > 0 ? dSEV/dAGB : null };
  });
  const median = a => { const v = a.filter(x=>x!=null && isFinite(x)).sort((x,y)=>x-y);
    if(!v.length) return null; const m = Math.floor(v.length/2);
    return v.length%2 ? v[m] : (v[m-1]+v[m])/2; };
  const mdR = median(pairs.map(p=>p.dR)), mdSEV = median(pairs.map(p=>p.dSEV)),
        mdAGB = median(pairs.map(p=>p.dAGB)), mdRatio = median(pairs.map(p=>p.ratio));
  // short ton AGB to t CO2e: 0.907185 Mg per short ton x 0.45 C fraction (as in the
  // source script) x 44/12
  const CO2E_PER_STON_AGB = 0.907185 * 0.45 * 44/12;
  const pr = data.meta && data.meta.params;

  return (
    <div style={{margin:"4px 4px 8px"}}>
      <div className="pn-head">
        <h3 className="pn-h">Faustmann optimal rotation: {stateName || state}</h3>
        <span className="pn-meta">by forest type, ecoregion and owner, with and without a carbon floor</span>
      </div>
      {data.meta && data.meta.known_issue && (
        <div role="note" className="pn-status" style={{color:"var(--warn)",margin:"0 0 10px"}}>
          <b>Known data issue: soil expectation values are overstated.</b>
          <p>These precomputed SEVs reproduce
          exactly with a stumpage of $12 per ft³, about 17 times the Maine blended price, so dollar values
          and optimal rotations on this tab are not reliable until the source table is regenerated. Use
          <span style={{fontWeight:600}}> Build a run</span> for land values at current prices.</p>
        </div>)}
      <div className="controls" style={{margin:"0 0 8px"}}>
        <select className="pn-sel" value={owner} onChange={e=>setOwner(e.target.value)} title="Owner">
          <option value="all">all owners</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="pn-sel" value={treatment} onChange={e=>setTreatment(e.target.value)} title="Treatment">
          <option value="all">both treatments</option>
          {treatments.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="pn-meta" style={{alignSelf:"center"}}>{rows.length} rows</span>
      </div>
      <div className="pn-chart">
        <Scatter rows={rows}/>
        {/* Points of four types overlap, so a keyed legend (square swatches) stands in for direct labels. */}
        <div className="pn-key" style={{margin:"6px 0 2px"}}>
          {[...new Set(rows.map(r=>r.ft))].map(ft =>
            <span key={ft}><i className="pn-sw" style={{background:col(ft)}}/>{ft}</span>)}
        </div>
      </div>
      {pairs.length > 0 && !(data.meta && data.meta.known_issue) && (
        <div className="pn-panel pn-rec">
          <div className="pn-head" style={{marginBottom:10}}>
            <h3 className="pn-h">Cost of the carbon floor</h3>
            <span className="pn-meta">medians over {pairs.length} paired cells</span>
          </div>
          <div className="pn-stats">
            {[["Rotation, longer", `+${mdR.toFixed(0)}`, "yr"],
              ["Soil expectation value, forgone", `$${mdSEV.toFixed(0)}`, "ac⁻¹"],
              ["Standing biomass carried, rotation mean", `+${mdAGB.toFixed(1)}`, "tons ac⁻¹"]
             ].map((c,i)=>(
              <div key={i} className="pn-stat">
                <span className="eyebrow">{c[0]}</span>
                <b>{c[1]}<small>{c[2]}</small></b>
              </div>))}
          </div>
          <p className="pn-cap" style={{marginTop:10}}>
            Each floored row is compared with the same cell (forest type, ecoregion, owner, treatment) without a floor.
            {mdRatio!=null && <> Implied cost: about <b className="pn-hl">${mdRatio.toFixed(0)} of soil expectation value per additional ton ac⁻¹</b> of
            standing biomass, roughly ${(mdRatio/CO2E_PER_STON_AGB).toFixed(0)} per t CO₂e held (C fraction 0.45). A within-model
            ratio, not a market carbon price.</>}
          </p>
        </div>
      )}
      <p className="tbl-cap"><b>Optimal rotation and soil expectation value by cell</b>, sorted by SEV</p>
      <div className="tbl-wrap" style={{maxHeight:260}}>
        <table className="tbl">
          <thead><tr>
            <th className="pn-left">Forest type</th><th>Ecoregion</th>
            <th>Owner</th><th>Carbon floor, rotation mean AGB (tons ac⁻¹)</th>
            <th>Optimal rotation (yr)</th>
            <th>SEV ({fmtUnit("$/ac")})</th>
            <th>Volume at rotation (ft³ ac⁻¹)</th>
          </tr></thead>
          <tbody>
            {rows.slice().sort((a,b)=>b.sev_opt-a.sev_opt).map((r,i) => (
              <tr key={i}>
                <td className="pn-left" style={{whiteSpace:"nowrap"}}><span className="pn-th-sw"><i className="pn-sw" aria-hidden="true" style={{background:col(r.ft)}}/>{r.ft}</span></td>
                <td style={{color:"var(--mut)"}}>{r.eco}</td>
                <td style={{color:"var(--mut)"}}>{r.owner}</td>
                <td>{r.carbon_floor}</td>
                <td>{r.R_opt}</td>
                <td>{r.sev_opt.toFixed(0)}</td>
                <td>{r.vol_at_R}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pn-note">
        Each point is one forest type, ecoregion and owner combination: optimal
        Faustmann rotation age against soil expectation value. Larger outlined points
        carry a carbon-floor constraint.
        {pr && <> Prices: ${pr.price_usd_ft3.toFixed(2)} ft⁻³ of merchantable volume ({pr.price_usd_m3} $ m⁻³ Maine blend),
        regeneration cost ${pr.regen_cost_usd_ac} ac⁻¹, {(pr.discount_rate*100).toFixed(0)}% real discount rate.
        One blended price on all volume favors short rotations; a 20 yr optimum is the lower edge of the search.</>}
        {" "}Source: {data.meta.source}. Data: api/faustmann_rotation.json.
      </p>
    </div>
  );
}
