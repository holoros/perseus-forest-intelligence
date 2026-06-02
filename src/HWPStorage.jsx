// Harvested wood products (HWP) carbon storage tab. Experimental layer.
// Source: api/hwp_storage.json (WPsCS-exact pool model, Wei 2022 service lives,
// driven by the PERSEUS hybrid harvest). Shows the in-use / landfill / charcoal
// stored-carbon pools and the cumulative Avoided Carbon (substitution) line,
// per state and management scenario. Reported separately from forest carbon
// per the FACT (Forestry Analytics for Carbon Tracking) taxonomy.
import { useState, useEffect } from "react";
import MiniChart from "./MiniChart.jsx";

const SCEN_ORDER = ["managed (harvest)", "managed (intensive)",
  "managed (conservation)", "reserve (no harvest)"];
const POOL = [
  { key: "total",    label: "HWP total",        color: "#d7301f" },
  { key: "solid",    label: "In-use solidwood", color: "#fe9929" },
  { key: "paper",    label: "In-use paper",     color: "#41ab5d" },
  { key: "landfill", label: "Landfill",         color: "#6baed6" },
  { key: "charcoal", label: "Charcoal",         color: "#8d6e63" },
];

export default function HWPStorage({ data, state }){
  const stData = data && data.states && data.states[state];
  const scens = stData
    ? SCEN_ORDER.filter(s => stData[s]) : [];
  const [scen, setScen] = useState(scens[0] || "managed (harvest)");
  useEffect(() => { if(scens.length && !scens.includes(scen)) setScen(scens[0]); }, [state]);

  if(!data || !data.states) return <div className="empty">HWP storage data not loaded.</div>;
  if(!stData) return <div className="empty">No HWP storage for {state}.</div>;

  const rows = stData[scen] || [];
  const line = key => rows.map(r => [r.year, null, r[key], null]);
  const poolSeries = POOL.map(p => ({ label: p.label, color: p.color, pts: line(p.key) }));
  const avoidSeries = [{ label: "Avoided (substitution)", color: "#9467bd", pts: line("avoided") }];

  const last = rows[rows.length - 1] || {};
  return (
    <div>
      <div className="controls" style={{marginTop:0}}>
        <select value={scen} onChange={e=>setScen(e.target.value)} title="Management scenario">
          {scens.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{color:"var(--mut)",fontSize:12,alignSelf:"center"}}>stored carbon (Tg C)</span>
      </div>
      <div className="chartcard" style={{padding:"6px 8px"}}>
        <MiniChart series={poolSeries} unit="Tg C" xlabel="Year"/>
      </div>
      <div className="lgd" style={{marginTop:8}}>
        {POOL.map(p => <span key={p.key}><i style={{background:p.color,width:14,height:3}}/>{p.label}</span>)}
      </div>
      <div className="chartcard" style={{padding:"6px 8px",marginTop:10}}>
        <MiniChart series={avoidSeries} unit="Tg C (cumulative)" xlabel="Year"/>
      </div>
      <div className="note">
        <b>Stored carbon</b> in harvested wood products under <b>{scen}</b> for {state}:
        in-use solidwood (building/exterior/home), paper, landfill, and charcoal pools,
        from a WPsCS-style first-order-decay model (Wei 2022 service lives) driven by the
        PERSEUS hybrid harvest. At {last.year}: HWP total {last.total?.toFixed(1)} Tg C.
        The lower panel is <b>Avoided Carbon</b> (substitution of wood for non-wood
        materials, cumulative, displacement factor 1.2) reported separately per the FACT
        taxonomy, never added to stored-carbon totals. <i>Experimental layer; parameters
        (regional product allocation, recycling) not yet finalized. Data: api/hwp_storage.json.</i>
      </div>
    </div>
  );
}
