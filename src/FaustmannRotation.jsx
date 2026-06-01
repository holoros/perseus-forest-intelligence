// Faustmann-rotation tab (Maine). Reconstructed from api/faustmann_rotation.json.
// Optimal rotation age (R_opt) and soil expectation value (SEV) by forest type,
// ecoregion and owner, with an optional carbon-floor constraint. Scatter of
// R_opt vs SEV colored by forest type, plus the underlying table.
import { useState } from "react";

const FT_COL = {
  "Northern hardwood":"#3fb68b", "Spruce-fir":"#6baed6", "Mixedwood":"#8da0cb",
  "Aspen-birch":"#e6ab02", "White/Red pine":"#d95f02", "Oak/Pine/Hemlock":"#a6761d",
};
const col = ft => FT_COL[ft] || "#aaa";

function Scatter({ rows }){
  const W = 460, H = 230, P = { l: 52, r: 12, t: 12, b: 28 };
  if(!rows.length) return <div className="note" style={{margin:"8px 4px"}}>No rows for this selection.</div>;
  const xs = rows.map(r=>r.R_opt), ys = rows.map(r=>r.sev_opt);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(0, ...ys), ymax = Math.max(...ys) * 1.05 || 1;
  const sx = x => P.l + (xmax===xmin?0.5:(x-xmin)/(xmax-xmin)) * (W-P.l-P.r);
  const sy = v => H - P.b - (ymax===ymin?0:(v-ymin)/(ymax-ymin)) * (H-P.t-P.b);
  const xt = []; for(let x=Math.ceil(xmin/10)*10; x<=xmax; x+=10) xt.push(x);
  const yt = [0,0.5,1].map(f => +(ymin + (ymax-ymin)*f).toFixed(0));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
      {yt.map(t => (<g key={t}>
        <line x1={P.l} x2={W-P.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth="0.5"/>
        <text x={P.l-6} y={sy(t)+3} textAnchor="end" fontSize="9" fill="var(--mut)">{t}</text>
      </g>))}
      {xt.map(t => <text key={t} x={sx(t)} y={H-9} textAnchor="middle" fontSize="9" fill="var(--mut)">{t}</text>)}
      <text x={(P.l+W-P.r)/2} y={H-0.5} textAnchor="middle" fontSize="9" fill="var(--mut)">Optimal rotation R_opt (yr)</text>
      <text x={4} y={P.t+4} fontSize="9" fill="var(--mut)">SEV ($/ac)</text>
      {rows.map((r,i) => (
        <circle key={i} cx={sx(r.R_opt)} cy={sy(r.sev_opt)} r={r.carbon_floor>0?5:3.4}
          fill={col(r.ft)} fillOpacity={r.carbon_floor>0?0.55:0.9}
          stroke={r.carbon_floor>0?"#fff":"none"} strokeWidth="0.6">
          <title>{`${r.ft} · ${r.eco} · ${r.owner}\nR_opt ${r.R_opt} yr · SEV $${r.sev_opt.toFixed(0)}/ac\ncarbon floor ${r.carbon_floor} lb C/ac · vol@R ${r.vol_at_R}`}</title>
        </circle>
      ))}
    </svg>
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
          <span key={ft}><i style={{background:col(ft),width:11,height:11,borderRadius:"50%"}}/>{ft}</span>)}
      </div>
      {meanR(noFloor)!=null && meanR(floor)!=null && (
        <div className="note">
          Carbon-floor effect: mean optimal rotation rises from
          <b> {meanR(noFloor).toFixed(0)} yr</b> (no floor) to
          <b> {meanR(floor).toFixed(0)} yr</b> with a carbon floor (filled, white-edged points).
        </div>
      )}
      <div className="chartcard" style={{padding:"4px 8px",marginTop:8,maxHeight:200,overflow:"auto"}}>
        <table style={{borderCollapse:"collapse",fontSize:10.5,width:"100%",fontVariantNumeric:"tabular-nums"}}>
          <thead><tr style={{color:"var(--mut)",textAlign:"left"}}>
            <th style={{padding:"2px 6px"}}>forest type</th><th style={{padding:"2px 6px"}}>eco</th>
            <th style={{padding:"2px 6px"}}>owner</th><th style={{padding:"2px 6px",textAlign:"right"}}>floor</th>
            <th style={{padding:"2px 6px",textAlign:"right"}}>R_opt</th>
            <th style={{padding:"2px 6px",textAlign:"right"}}>SEV $/ac</th>
            <th style={{padding:"2px 6px",textAlign:"right"}}>vol@R</th>
          </tr></thead>
          <tbody>
            {rows.slice().sort((a,b)=>b.sev_opt-a.sev_opt).map((r,i) => (
              <tr key={i} style={{borderTop:"1px solid var(--line)"}}>
                <td style={{padding:"2px 6px"}}><i style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:col(r.ft),marginRight:5}}/>{r.ft}</td>
                <td style={{padding:"2px 6px",color:"var(--mut)"}}>{r.eco}</td>
                <td style={{padding:"2px 6px",color:"var(--mut)"}}>{r.owner}</td>
                <td style={{padding:"2px 6px",textAlign:"right"}}>{r.carbon_floor}</td>
                <td style={{padding:"2px 6px",textAlign:"right"}}>{r.R_opt}</td>
                <td style={{padding:"2px 6px",textAlign:"right"}}>{r.sev_opt.toFixed(0)}</td>
                <td style={{padding:"2px 6px",textAlign:"right",color:"var(--mut)"}}>{r.vol_at_R}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        Each point is one forest-type / ecoregion / owner combination: optimal
        Faustmann rotation age vs soil expectation value. Larger white-edged points
        carry a carbon-floor constraint. Source: {data.meta.source}. Data:
        api/faustmann_rotation.json.
      </div>
    </div>
  );
}
