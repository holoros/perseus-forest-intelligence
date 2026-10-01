// Faustmann-rotation tab (Maine). Reconstructed from api/faustmann_rotation.json.
// Optimal rotation age (R_opt) and soil expectation value (SEV) by forest type,
// ecoregion and owner, with an optional carbon-floor constraint. Scatter of
// R_opt vs SEV colored by forest type, plus the underlying table.
import { useEffect, useState } from "react";
import { fmtUnit } from "./units.js";

// Okabe-Ito forest-type colors, shared with the Landowner yields chart.
const FT_COL = {
  "Northern hardwood":"#009E73", "Spruce-fir":"#0072B2", "Mixedwood":"#56B4E9",
  "Aspen-birch":"#E69F00", "White/Red pine":"#D55E00", "Oak/Pine/Hemlock":"#CC79A7",
};
const col = ft => FT_COL[ft] || "var(--context)";
const niceStep = raw => { const mag = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; };

function Scatter({ rows }){
  // Viewbox follows the rendered width so axis text holds its 10 px floor.
  const [box, setBox] = useState(null);
  const [W, setW] = useState(460);
  useEffect(() => {
    if(!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => { const cw = Math.round(Math.min(e.contentRect.width, 720)); if(cw > 0) setW(Math.max(320, cw)); });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
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
  const xt = []; for(let x=Math.ceil(xmin/10)*10; x<=xmax; x+=10) xt.push(x);
  const yt = []; for(let v = Math.ceil(ymin/ystep)*ystep; v <= ymax + ystep*1e-6; v += ystep) yt.push(+v.toFixed(6));
  return (
    <div ref={setBox} style={{width:"100%"}}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
      {yt.map(t => (<g key={t}>
        <line x1={P.l} x2={W-P.r} y1={sy(t)} y2={sy(t)} className={t === 0 ? "ch-base" : "ch-grid"}/>
        <text x={P.l-6} y={sy(t)+3.5} textAnchor="end" className="ch-txt">{t.toLocaleString()}</text>
      </g>))}
      {xt.map(t => <text key={t} x={sx(t)} y={H-P.b+15} textAnchor="middle" className="ch-txt">{t}</text>)}
      <text x={(P.l+W-P.r)/2} y={H-4} textAnchor="middle" className="ch-txt">Optimal rotation R_opt (yr), axis zoomed to data</text>
      <text x={P.l-6} y={13} textAnchor="start" className="ch-ttl">Soil expectation value, SEV ({fmtUnit("$/ac")})</text>
      <text x={P.l-6} y={27} textAnchor="start" className="ch-note">small solid points: no carbon floor · large outlined points: carbon floor</text>
      {rows.map((r,i) => (
        <circle key={i} cx={sx(r.R_opt)} cy={sy(r.sev_opt)} r={r.carbon_floor>0?5:3.4}
          fillOpacity={r.carbon_floor>0?0.55:0.9}
          strokeWidth={r.carbon_floor>0?1:0}
          style={{fill:col(r.ft), stroke:r.carbon_floor>0?"var(--ink)":"none"}}>
          <title>{`${r.ft} · ${r.eco} · ${r.owner}\nR_opt ${r.R_opt} yr · SEV $${r.sev_opt.toFixed(0)} ${fmtUnit("per ac")}\ncarbon floor ${r.carbon_floor} ${fmtUnit("lb C/ac")} · vol@R ${r.vol_at_R}`}</title>
        </circle>
      ))}
    </svg>
    </div>
  );
}

export default function FaustmannRotation({ data, state }){
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
  // carbon-floor effect: mean R_opt with vs without a floor, same filter
  const noFloor = rows.filter(r=>r.carbon_floor===0), floor = rows.filter(r=>r.carbon_floor>0);
  const meanR = a => a.length ? (a.reduce((s,r)=>s+r.R_opt,0)/a.length) : null;

  return (
    <div>
      <div className="controls" style={{marginTop:0}}>
        <select value={owner} onChange={e=>setOwner(e.target.value)} title="Owner">
          <option value="all">all owners</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={treatment} onChange={e=>setTreatment(e.target.value)} title="Treatment">
          <option value="all">both treatments</option>
          {treatments.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{color:"var(--mut)",fontSize:12,alignSelf:"center"}}>{rows.length} rows</span>
      </div>
      <div className="chartcard" style={{padding:"6px 8px"}}>
        <Scatter rows={rows}/>
      </div>
      <div className="lgd" style={{marginTop:8}}>
        {[...new Set(rows.map(r=>r.ft))].map(ft =>
          <span key={ft}><i style={{background:col(ft),width:10,height:10,borderRadius:"50%"}}/>{ft}</span>)}
      </div>
      {meanR(noFloor)!=null && meanR(floor)!=null && (
        <div className="note">
          Carbon-floor effect: mean optimal rotation rises from
          <b> {meanR(noFloor).toFixed(0)} yr</b> (no floor) to
          <b> {meanR(floor).toFixed(0)} yr</b> with a carbon floor (larger, outlined points).
        </div>
      )}
      <div className="chartcard" style={{padding:"4px 8px",marginTop:8,maxHeight:200,overflow:"auto"}}>
        <table className="tbl">
          <thead><tr>
            <th>forest type</th><th>eco</th>
            <th>owner</th><th>floor ({fmtUnit("lb C/ac")})</th>
            <th>R_opt (yr)</th>
            <th>SEV ({fmtUnit("$/ac")})</th>
            <th>vol@R</th>
          </tr></thead>
          <tbody>
            {rows.slice().sort((a,b)=>b.sev_opt-a.sev_opt).map((r,i) => (
              <tr key={i} style={{borderTop:"1px solid var(--line)"}}>
                <td><i style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:col(r.ft),marginRight:5}}/>{r.ft}</td>
                <td style={{color:"var(--mut)"}}>{r.eco}</td>
                <td style={{color:"var(--mut)"}}>{r.owner}</td>
                <td>{r.carbon_floor}</td>
                <td>{r.R_opt}</td>
                <td>{r.sev_opt.toFixed(0)}</td>
                <td style={{color:"var(--mut)"}}>{r.vol_at_R}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        Each point is one forest-type / ecoregion / owner combination: optimal
        Faustmann rotation age vs soil expectation value. Larger outlined points
        carry a carbon-floor constraint. Source: {data.meta.source}. Data:
        api/faustmann_rotation.json.
      </div>
    </div>
  );
}
