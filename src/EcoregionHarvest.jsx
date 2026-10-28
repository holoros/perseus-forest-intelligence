// Ecoregion harvest-probability summary: per-EPA-Level-III-ecoregion mean
// harvest probability (any / stand-replacement / partial), zonal-averaged from
// the CONUS harvest-probability rasters. A sortable, searchable house table, the
// "summarize by ecoregion" companion to the per-pixel raster overlays.
import { useMemo, useState } from "react";
import EcoregionMap from "./EcoregionMap.jsx";

const PCOLS = [
  ["p_harvest_any","P(any harvest)"],
  ["p_harvest_clearcut","P(stand repl.)"],
  ["p_harvest_partial","P(partial)"],
];
const SCOLS = [
  ["stand_height_ft","Height (ft)"],
  ["stocking_pct","Stocking (%)"],
  ["qmd_in","QMD (in)"],
  ["cspi_productivity","CSPI (0 to 100)"],
];
// Cell tint for a 0..1 probability: the accent at 6% (low) to 32% (high) over the panel.
// Single hue, theme aware; ink stays above 7:1 on the darkest tint in both themes.
const shade = v => {
  if(v==null) return "transparent";
  const t=Math.max(0,Math.min(1,v));
  return `color-mix(in srgb, var(--accent) ${Math.round(6+26*t)}%, transparent)`;
};

export default function EcoregionHarvest({ data, geo }){
  const MAPFLDS=[["p_harvest_clearcut","P(stand replacement)",v=>v.toFixed(2)],
    ["p_harvest_any","P(any harvest)",v=>v.toFixed(2)],
    ["stand_height_ft","Stand height (ft)",v=>v.toFixed(0)],
    ["cspi_productivity","Productivity (CSPI)",v=>v.toFixed(0)],
    ["qmd_in","QMD (in)",v=>v.toFixed(1)]];
  const [mapField,setMapField]=useState("p_harvest_clearcut");
  const mf=MAPFLDS.find(x=>x[0]===mapField)||MAPFLDS[0];
  const [sortKey,setSortKey]=useState("p_harvest_any");
  const [asc,setAsc]=useState(false);
  const [q,setQ]=useState("");
  const rows=useMemo(()=>{
    if(!data || !data.ecoregions) return [];
    let r=Object.entries(data.ecoregions).map(([code,v])=>({code,...v}));
    if(q){ const s=q.toLowerCase(); r=r.filter(x=>(x.name||"").toLowerCase().includes(s)||(x.l1||"").toLowerCase().includes(s)||x.code.includes(s)); }
    r.sort((a,b)=>{ const av=a[sortKey],bv=b[sortKey];
      if(typeof av==="string") return asc?av.localeCompare(bv):bv.localeCompare(av);
      return asc?(av-bv):(bv-av); });
    return r;
  },[data,sortKey,asc,q]);

  if(!data) return <div className="empty">Ecoregion harvest summary not loaded.</div>;
  const th=(key,lbl,left)=>{
    const on=sortKey===key;
    return <th className={"sortable"+(left?" pn-left":"")} scope="col"
        aria-sort={on?(asc?"ascending":"descending"):"none"}
        onClick={()=>{ if(on) setAsc(!asc); else { setSortKey(key); setAsc(false);} }}
        title="click to sort">{lbl}<span className="sort" aria-hidden="true">{on?(asc?"▲":"▼"):""}</span></th>; };

  return (
    <div style={{margin:"4px 4px 8px"}}>
      <div className="pn-head">
        <h3 className="pn-h">Forest summary by ecoregion</h3>
        <span className="pn-meta">{rows.length} EPA Level III ecoregions, about 3.1 km zonal mean</span>
      </div>
      {data && data.ecoregions && geo && (
        <div className="pn-chart">
          <label className="pn-field" style={{marginBottom:6}}>
            <span className="eyebrow">Map</span>
            <select className="pn-sel" value={mapField} onChange={e=>setMapField(e.target.value)}>
              {MAPFLDS.filter(x=>Object.values(data.ecoregions).some(v=>v[x[0]]!=null)).map(x=>
                <option key={x[0]} value={x[0]}>{x[1]}</option>)}
            </select>
          </label>
          <EcoregionMap geo={geo} eco={data.ecoregions} field={mapField} label={mf[1]} fmt={mf[2]}/>
          <p className="pn-cap">The stronger the fill, the higher the value; grey ecoregions have no forest summary.</p>
        </div>
      )}
      <label className="pn-field">
        <span className="eyebrow">Filter</span>
        <input className="pn-input" value={q} onChange={e=>setQ(e.target.value)} aria-label="filter ecoregions by name, biome or code"/>
      </label>
      <div className="pn-cap" style={{margin:"0 0 6px",color:"var(--ink-2)"}}>
        <b className="pn-hl">Ecoregion means.</b> Harvest probability over the window (0 to 1, cells tinted faint to strong), forest structure and productivity; click a column to sort.
      </div>
      <div className="tbl-wrap" style={{maxHeight:460}}>
        <table className="tbl pn-dense" aria-label="Forest summary by ecoregion">
          <thead><tr>
            {th("code","L3")}{th("name","Ecoregion",true)}{th("l1","Biome (L1)",true)}
            {PCOLS.map(([k,l])=>th(k,l))}{SCOLS.map(([k,l])=>th(k,l))}
          </tr></thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.code}>
                <td style={{color:"var(--mut)"}}>{r.code}</td>
                <td className="pn-left">{r.name}</td>
                <td className="pn-left" style={{color:"var(--mut)"}}>{(r.l1||"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}</td>
                {PCOLS.map(([k])=>(
                  <td key={k} style={{background:shade(r[k])}}>
                    {r[k]!=null?r[k].toFixed(2):"n/a"}</td>))}
                {SCOLS.map(([k])=>(
                  <td key={k}>
                    {r[k]!=null?r[k].toFixed(k==="qmd_in"?1:0):"n/a"}</td>))}
              </tr>))}
          </tbody>
        </table>
      </div>
      <p className="pn-note">
        Mean modeled harvest probability per EPA Level III ecoregion, zonal-averaged from the CONUS harvest-probability rasters. P(any) is the chance a forested pixel is harvested in the window; the stand-replacement versus partial split shows the silvicultural character: high stand-replacement with low partial means clearcut-dominated regions, the reverse means selection or partial systems. Forest structure is the TreeMap 2022 zonal mean; productivity is the climate-sensitive productivity index (CSPI, 0 to 100) warped to the same grid.
      </p>
    </div>
  );
}
