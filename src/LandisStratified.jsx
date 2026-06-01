// LANDIS-stratified tab (Maine). Reconstructed from api/landis_stratified.json
// (LANDIS-II PERSEUS runs). Live AGB vs stand age, stratified by climate
// scenario, harvest regime, owner class, and forest-type group; one line per
// ecological section, with the lo-hi band.
import { useState, useEffect } from "react";
import MiniChart from "./MiniChart.jsx";

const ECO_PALETTE = ["#3fb68b","#6baed6","#e6ab02","#d95f02","#8da0cb","#a6761d","#e7298a","#66c2a5"];
const keys = o => (o && typeof o === "object") ? Object.keys(o) : [];

export default function LandisStratified({ data, state }){
  const stData = data && data[state];
  const response = data && data.meta && data.meta.response;
  const root = stData && response ? stData[response] : null;

  const [climate, setClimate] = useState("baseline");
  const [harvest, setHarvest] = useState("none");
  const [owner, setOwner] = useState("");
  const [ft, setFt] = useState("");

  // keep selections valid as the tree narrows
  const climates = keys(root);
  const cl = climates.includes(climate) ? climate : climates[0];
  const harvests = keys(root && root[cl]);
  const hv = harvests.includes(harvest) ? harvest : harvests[0];
  const owners = keys(root && root[cl] && root[cl][hv]);
  const ow = owners.includes(owner) ? owner : owners[0];
  const fts = keys(root && root[cl] && root[cl][hv] && root[cl][hv][ow]);
  const ftSel = fts.includes(ft) ? ft : fts[0];

  useEffect(()=>{ setOwner(""); setFt(""); },[state]);
  if(!data || !data.meta) return <div className="empty">LANDIS-stratified data not loaded.</div>;
  if(!root)
    return <div><div className="empty">No LANDIS series for {state}.</div>
      <div className="note">LANDIS-II PERSEUS runs are Maine only at present.</div></div>;

  const ecoObj = (root[cl] && root[cl][hv] && root[cl][hv][ow] && root[cl][hv][ow][ftSel]) || {};
  const series = keys(ecoObj).map((eco, i) => ({
    label: eco,
    color: ECO_PALETTE[i % ECO_PALETTE.length],
    pts: ecoObj[eco].map(r => [r[0], r[2], r[1], r[3]]), // [age, q_lo, mean, q_hi]
  }));

  const sel = (val, set, opts, title) => (
    <select value={val} onChange={e=>set(e.target.value)} title={title}>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div>
      <div className="controls" style={{marginTop:0}}>
        {sel(cl, setClimate, climates, "Climate scenario")}
        {sel(hv, setHarvest, harvests, "Harvest regime")}
        {sel(ow, setOwner, owners, "Owner class")}
        {sel(ftSel, setFt, fts, "Forest-type group")}
      </div>
      <div className="chartcard" style={{padding:"6px 8px"}}>
        <MiniChart series={series} unit={data.meta.response_label}/>
      </div>
      <div className="lgd" style={{marginTop:8}}>
        {series.map(s => <span key={s.label}><i style={{background:s.color,width:14,height:3}}/>{s.label}</span>)}
      </div>
      <div className="note">
        Mean {data.meta.response_label} vs stand age (solid) with the lo-hi band,
        for <b>{cl}</b> climate, <b>{hv}</b> harvest, <b>{ow}</b> ownership,
        <b> {ftSel}</b>. One line per ecological section. Engine: {data.meta.engine}.
        Data: api/landis_stratified.json.
      </div>
    </div>
  );
}
