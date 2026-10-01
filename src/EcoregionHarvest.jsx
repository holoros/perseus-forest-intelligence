// Ecoregion harvest-probability summary: per-EPA-Level-III-ecoregion mean
// harvest probability (any / stand-replacement / partial), zonal-averaged from
// the CONUS harvest-probability rasters. A sortable, searchable table — the
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
  ["cspi_productivity","Productivity (CSPI)"],
];
// blue(low)->amber->red(high) cell shade for a 0..1 probability
const shade = v => {
  if(v==null) return "transparent";
  const t=Math.max(0,Math.min(1,v));
  const stops=[[0.3,[47,98,158]],[0.6,[202,161,90]],[0.95,[224,90,90]]];
  let a=stops[0],b=stops[stops.length-1];
  for(let i=1;i<stops.length;i++){ if(t<=stops[i][0]){ a=stops[i-1]; b=stops[i]; break; } }
  const f=(t-a[0])/((b[0]-a[0])||1);
  const c=a[1].map((ca,k)=>Math.round(ca+f*(b[1][k]-ca)));
  return `rgba(${c[0]},${c[1]},${c[2]},0.55)`;
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
  // House table: centered cells, bold centered header, three rules (above and below the
  // header, below the last row). border-collapse:separate so the header rules stay with the
  // sticky header while the body scrolls.
  const RULE="1px solid var(--line-strong, var(--line))";
  const th=(key,lbl)=>(
    <th onClick={()=>{ if(sortKey===key) setAsc(!asc); else { setSortKey(key); setAsc(false);} }}
        style={{position:"sticky",top:0,zIndex:1,background:"var(--panel)",color:"var(--ink)",fontWeight:700,
          padding:"5px 8px",textAlign:"center",verticalAlign:"middle",cursor:"pointer",whiteSpace:"nowrap",
          borderTop:RULE,borderBottom:RULE}}
        title="click to sort">{lbl}{sortKey===key?(asc?" ▲":" ▼"):""}</th>);
  const td={padding:"3px 8px",textAlign:"center",verticalAlign:"middle",color:"var(--ink)"};
  const last=i=>i===rows.length-1?{borderBottom:RULE}:null;
  const fieldStyle={background:"var(--panel)",color:"var(--ink)",border:"1px solid var(--line)",borderRadius:5,
    transition:"border-color var(--dur, 200ms) var(--ease, cubic-bezier(0.25,1,0.5,1))"};

  return (
    <div style={{margin:"4px 4px 8px"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:5}}>
        <b style={{fontSize:13}}>Forest summary by ecoregion</b>
        <span style={{color:"var(--mut)",fontSize:11}}>{rows.length} EPA Level III ecoregions · ~3.1 km zonal mean · harvest probability, structure and productivity</span>
      </div>
      {data && data.ecoregions && geo && (
        <div style={{marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"var(--mut)"}}>map:</span>
            <select value={mapField} onChange={e=>setMapField(e.target.value)}
              style={{...fieldStyle,fontSize:11.5,padding:"2px 6px"}}>
              {MAPFLDS.filter(x=>Object.values(data.ecoregions).some(v=>v[x[0]]!=null)).map(x=>
                <option key={x[0]} value={x[0]}>{x[1]}</option>)}
            </select>
          </div>
          <EcoregionMap geo={geo} eco={data.ecoregions} field={mapField} label={mf[1]} fmt={mf[2]}/>
        </div>
      )}
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="filter by ecoregion or biome…"
        aria-label="filter ecoregions"
        style={{...fieldStyle,width:"min(320px,90%)",padding:"4px 8px",marginBottom:8,fontSize:12}}/>
      <div style={{fontSize:12,color:"var(--ink-2, var(--mut))",margin:"0 0 6px"}}>
        <b style={{color:"var(--ink)"}}>Ecoregion means.</b> Harvest probability (0 to 1, shaded low blue to high red), forest structure and productivity; click a column to sort.
      </div>
      <div style={{maxHeight:420,overflow:"auto"}}>
        <table className="tbl" aria-label="Forest summary by ecoregion"
          style={{borderCollapse:"separate",borderSpacing:0,border:"none",fontSize:11.5,width:"100%",fontVariantNumeric:"tabular-nums"}}>
          <thead><tr>
            {th("code","L3")}{th("name","Ecoregion")}{th("l1","Biome (L1)")}
            {PCOLS.map(([k,l])=>th(k,l))}{SCOLS.map(([k,l])=>th(k,l))}
          </tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.code}>
                <td style={{...td,...last(i),color:"var(--mut)"}}>{r.code}</td>
                <td style={{...td,...last(i)}}>{r.name}</td>
                <td style={{...td,...last(i),color:"var(--mut)",fontSize:10.5}}>{(r.l1||"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}</td>
                {PCOLS.map(([k])=>(
                  <td key={k} style={{...td,...last(i),background:shade(r[k])}}>
                    {r[k]!=null?r[k].toFixed(2):"n/a"}</td>))}
                {SCOLS.map(([k])=>(
                  <td key={k} style={{...td,...last(i)}}>
                    {r[k]!=null?r[k].toFixed(k==="qmd_in"?1:0):"n/a"}</td>))}
              </tr>))}
          </tbody>
        </table>
      </div>
      <div style={{color:"var(--mut)",fontSize:11,marginTop:8,maxWidth:600,lineHeight:1.5}}>
        Mean modeled harvest probability per EPA Level III ecoregion, zonal-averaged from the CONUS harvest-probability rasters. P(any) is the chance a forested pixel is harvested in the window; the stand-replacement vs partial split shows the silvicultural character: high stand-replacement with low partial means clearcut-dominated regions, the reverse means selection or partial systems. Forest structure is the TreeMap 2022 zonal mean; productivity is the climate-sensitive productivity index (CSPI, 0 to 100) warped to the same grid. Click a column to sort.
      </div>
    </div>
  );
}
