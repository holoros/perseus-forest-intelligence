// Ecoregion harvest-probability summary: per-EPA-Level-III-ecoregion mean
// harvest probability (any / stand-replacement / partial), zonal-averaged from
// the CONUS harvest-probability rasters. A sortable, searchable table — the
// "summarize by ecoregion" companion to the per-pixel raster overlays.
import { useMemo, useState } from "react";

const PCOLS = [
  ["p_harvest_any","P(any harvest)"],
  ["p_harvest_clearcut","P(stand repl.)"],
  ["p_harvest_partial","P(partial)"],
];
const SCOLS = [
  ["stand_height_ft","Height (ft)"],
  ["stocking_pct","Stocking (%)"],
  ["qmd_in","QMD (in)"],
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

export default function EcoregionHarvest({ data }){
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
  const th=(key,lbl)=>(
    <th onClick={()=>{ if(sortKey===key) setAsc(!asc); else { setSortKey(key); setAsc(false);} }}
        style={{padding:"3px 7px",textAlign:key==="name"||key==="l1"?"left":"right",cursor:"pointer",whiteSpace:"nowrap"}}
        title="click to sort">{lbl}{sortKey===key?(asc?" ▲":" ▼"):""}</th>);

  return (
    <div style={{margin:"4px 4px 8px"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:5}}>
        <b style={{fontSize:13}}>Forest summary by ecoregion</b>
        <span style={{color:"var(--mut)",fontSize:11}}>{rows.length} EPA Level III ecoregions · ~3.1 km zonal mean · harvest probability + forest structure</span>
      </div>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="filter by ecoregion or biome…"
        style={{width:"min(320px,90%)",padding:"4px 8px",marginBottom:6,fontSize:12,
          background:"var(--panel,#172029)",color:"var(--fg,#e8eef2)",border:"1px solid var(--line,#2a3a47)",borderRadius:5}}/>
      <div style={{maxHeight:420,overflow:"auto",border:"1px solid var(--line,#2a3a47)",borderRadius:6}}>
        <table style={{borderCollapse:"collapse",fontSize:11,width:"100%",fontVariantNumeric:"tabular-nums"}}>
          <thead><tr style={{color:"var(--mut)",position:"sticky",top:0,background:"var(--panel,#172029)"}}>
            {th("code","L3")}{th("name","Ecoregion")}{th("l1","Biome (L1)")}
            {PCOLS.map(([k,l])=>th(k,l))}{SCOLS.map(([k,l])=>th(k,l))}
          </tr></thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.code} style={{borderTop:"1px solid var(--line,#22303a)"}}>
                <td style={{padding:"2px 7px",color:"var(--mut)"}}>{r.code}</td>
                <td style={{padding:"2px 7px"}}>{r.name}</td>
                <td style={{padding:"2px 7px",color:"var(--mut)",fontSize:10}}>{(r.l1||"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}</td>
                {PCOLS.map(([k])=>(
                  <td key={k} style={{padding:"2px 7px",textAlign:"right",background:shade(r[k])}}>
                    {r[k]!=null?r[k].toFixed(2):"—"}</td>))}
                {SCOLS.map(([k])=>(
                  <td key={k} style={{padding:"2px 7px",textAlign:"right",color:"var(--fg,#dfe7ec)"}}>
                    {r[k]!=null?r[k].toFixed(k==="qmd_in"?1:0):"—"}</td>))}
              </tr>))}
          </tbody>
        </table>
      </div>
      <div style={{color:"var(--mut)",fontSize:10.5,marginTop:5,maxWidth:600,lineHeight:1.45}}>
        Mean modeled harvest probability per EPA Level III ecoregion, zonal-averaged from the CONUS harvest-probability rasters. P(any) is the chance a forested pixel is harvested in the window; the stand-replacement vs partial split shows the silvicultural character — high stand-replacement with low partial means clearcut-dominated regions, the reverse means selection/partial systems. Forest structure (stand height, all-live stocking, quadratic mean diameter) is the TreeMap 2022 zonal mean. Click a column to sort.
      </div>
    </div>
  );
}
