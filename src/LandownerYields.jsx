// Landowner-yields tab (Maine). Reconstructed from api/landowner_yields.json
// (Cardinal landowner atlas phase 1). Above-ground live biomass vs stand age,
// stratified by owner class and forest-type group: fitted curve with the
// q10-q90 empirical band.
import { useState, useEffect } from "react";
import MiniChart from "./MiniChart.jsx";
import { fmtUnit } from "./units.js";

// Okabe-Ito forest-type colors, shared with the Faustmann rotation chart.
const FT_COL = { AB:"#E69F00", NHWD:"#009E73", PINE:"#D55E00", SF:"#0072B2",
  EAC:"#56B4E9", OAK:"#CC79A7" };
const fmtLabel = s => typeof s !== "string" ? s
  : s.replace(/(?<![A-Za-z])((?:\$|[A-Za-z]{1,3})(?: C)?)\/([A-Za-z]{1,3})(?:\/([A-Za-z]{1,3}))?(?![A-Za-z])/g, m => fmtUnit(m));
const FT_LABEL = { AB:"Aspen-birch", NHWD:"Northern hardwood", PINE:"Pine",
  SF:"Spruce-fir", EAC:"Elm-ash-cottonwood", OAK:"Oak" };

export default function LandownerYields({ data, state }){
  const stData = data && data[state];
  const owners = stData ? Object.keys(stData) : [];
  const [owner, setOwner] = useState(owners[0] || "");
  useEffect(()=>{ if(owners.length && !owners.includes(owner)) setOwner(owners[0]); },[state]);
  if(!data || !data.meta) return <div className="empty">Landowner-yields data not loaded.</div>;
  if(!stData)
    return <div><div className="empty">No landowner yields for {state}.</div>
      <div className="note">Coverage: {(data.meta.states||[]).join(", ")} (phase 1 is Maine only).</div></div>;

  const byFt = stData[owner] || {};
  const series = Object.keys(byFt).map(ft => ({
    label: FT_LABEL[ft] || ft,
    color: FT_COL[ft] || "var(--context)",
    bandName: "q10 to q90 plot band",
    pts: byFt[ft].map(r => [r.age, r.q10, (r.fit!=null?r.fit:r.q50), r.q90]),
  }));

  return (
    <div>
      <div className="controls" style={{marginTop:0}}>
        <select value={owner} onChange={e=>setOwner(e.target.value)} title="Owner class">
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{color:"var(--mut)",fontSize:12,alignSelf:"center"}}>{fmtLabel(data.meta.metric)}</span>
      </div>
      <div className="chartcard" style={{padding:"6px 8px"}}>
        <MiniChart series={series} unit={`Aboveground live biomass (${fmtUnit("Mg/ha")})`}/>
      </div>
      <div className="lgd" style={{marginTop:8}}>
        {Object.keys(byFt).map(ft =>
          <span key={ft}><i style={{background:FT_COL[ft]||"var(--context)",width:14,height:3}}/>{FT_LABEL[ft]||ft}</span>)}
      </div>
      <div className="note">
        Fitted yield curve (solid) with the q10 to q90 plot band (shaded), for
        <b> {owner}</b> ownership across forest-type groups. Source: {data.meta.source}.
        Data: api/landowner_yields.json.
      </div>
    </div>
  );
}
