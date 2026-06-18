// Bring-your-own-inventory: upload your own stand / monitoring observations
// (year, value) and see them against this state's multi-model envelope for the
// selected metric. Answers "are the models tracking my forest?" — the
// upload-your-stands gap vs Forest Flux, on PERSEUS's multi-model footing.
import { useMemo, useRef, useState } from "react";

// median / min / max of value across engines at each year, for one bucket
function envelope(arr){
  if(!arr || !arr.length) return [];
  const byYr={};
  arr.forEach(s=>(s.pts||[]).forEach(p=>{ if(p[1]==null||isNaN(p[1])) return; (byYr[p[0]]=byYr[p[0]]||[]).push(p[1]); }));
  return Object.keys(byYr).map(Number).sort((a,b)=>a-b).map(y=>{
    const v=byYr[y].slice().sort((a,b)=>a-b);
    const med=v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2;
    return {y, lo:v[0], hi:v[v.length-1], med};
  });
}
const medAt=(env,yr)=>{
  if(!env.length) return null;
  if(yr<=env[0].y) return env[0].med;
  if(yr>=env[env.length-1].y) return env[env.length-1].med;
  for(let i=1;i<env.length;i++){ const a=env[i-1],b=env[i];
    if(yr>=a.y&&yr<=b.y){ const t=(yr-a.y)/((b.y-a.y)||1); return a.med+t*(b.med-a.med); } }
  return null;
};

// tolerant CSV parse → [{year, value, label}]
function parseCsv(text){
  const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length) return {rows:[],err:"empty file"};
  const delim = lines[0].includes("\t")?"\t":",";
  const head=lines[0].split(delim).map(h=>h.trim().toLowerCase());
  const looksHeader = head.some(h=>/[a-z]/.test(h));
  const cells = lines.map(l=>l.split(delim).map(c=>c.trim()));
  let yi=-1, vi=-1, li=-1, start=0;
  if(looksHeader){
    start=1;
    yi=head.findIndex(h=>/(year|yr|date)/.test(h));
    if(yi<0) yi=head.findIndex(h=>/age/.test(h));
    vi=head.findIndex(h=>/(agc|carbon|biomass|agb|value|tg|stock|val)/.test(h));
    li=head.findIndex(h=>/(id|name|stand|plot|label)/.test(h));
    if(yi<0||vi<0){ // fall back to first numeric pair
      const nums=head.map((_,i)=>cells.slice(1).every(r=>r[i]!==undefined && r[i]!=="" && !isNaN(+r[i])));
      const ni=nums.map((b,i)=>b?i:-1).filter(i=>i>=0);
      if(yi<0) yi=ni[0]; if(vi<0) vi=ni[1];
    }
  } else { yi=0; vi=1; li=-1; }
  if(yi<0||vi<0) return {rows:[],err:"could not find a year/age column and a value column"};
  const rows=[];
  for(let i=start;i<cells.length;i++){
    const r=cells[i]; const y=+r[yi], v=+r[vi];
    if(isNaN(y)||isNaN(v)) continue;
    rows.push({year:y, value:v, label: li>=0? r[li]: ""});
  }
  return {rows, err: rows.length?null:"no numeric rows parsed", ycol: yi, vcol: vi};
}

export default function MyStands({ series, metric, bucket, unit, stateName, landowner, stateCode }){
  const [rows,setRows]=useState([]);
  const [xmode,setXmode]=useState("year");  // year | age
  const [err,setErr]=useState(null);
  const [fname,setFname]=useState("");
  const fileRef=useRef(null);

  // Age-axis reference: aggregate the landowner yield curves for this state
  // across owner x forest type into a per-age band (min q10 .. max q90) + median q50.
  const ageEnv=useMemo(()=>{
    const st=landowner && (landowner[stateCode]||landowner[stateName]);
    if(!st || typeof st!=="object") return [];
    const byAge={};
    Object.values(st).forEach(byFt=>{ if(byFt&&typeof byFt==="object")
      Object.values(byFt).forEach(arr=>{ if(Array.isArray(arr)) arr.forEach(p=>{
        if(p&&p.age!=null){ (byAge[p.age]=byAge[p.age]||[]).push(p); } }); }); });
    return Object.keys(byAge).map(Number).sort((a,b)=>a-b).map(age=>{
      const ps=byAge[age]; const q50=ps.map(p=>p.q50).filter(v=>v!=null).sort((a,b)=>a-b);
      const med=q50.length?(q50.length%2?q50[(q50.length-1)/2]:(q50[q50.length/2-1]+q50[q50.length/2])/2):null;
      return {y:age, lo:Math.min(...ps.map(p=>p.q10!=null?p.q10:p.q50)), hi:Math.max(...ps.map(p=>p.q90!=null?p.q90:p.q50)), med};
    });
  },[landowner,stateCode,stateName]);
  const env=useMemo(()=>{
    const node=series && series[metric] && series[metric][bucket];
    return envelope(node);
  },[series,metric,bucket]);
  const activeEnv = xmode==="age" ? ageEnv : env;

  const onFile=e=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    setFname(f.name);
    const rd=new FileReader();
    rd.onload=()=>{ const p=parseCsv(String(rd.result)); setRows(p.rows); setErr(p.err);
      // if the detected x values are small (typical stand ages) default to age mode
      if(p.rows.length){ const mx=Math.max(...p.rows.map(r=>r.year)); setXmode(mx<=200?"age":"year"); } };
    rd.readAsText(f);
  };

  // comparison stats: user point vs regional median at same year
  const stats=useMemo(()=>{
    if(!rows.length||!activeEnv.length) return null;
    let above=0, n=0, sumDev=0;
    rows.forEach(r=>{ const m=medAt(activeEnv,r.year); if(m!=null){ n++; if(r.value>=m) above++; sumDev+=(r.value-m)/(m||1)*100; } });
    return n? {n, above, pctAbove: above/n*100, meanDev: sumDev/n}: null;
  },[rows,activeEnv]);

  // chart geometry
  const W=560,H=320,L=56,R=20,T=22,B=38;
  const all=[...activeEnv.flatMap(e=>[e.lo,e.hi,e.med]), ...rows.map(r=>r.value)].filter(v=>v!=null&&isFinite(v));
  const yrs=[...activeEnv.map(e=>e.y), ...rows.map(r=>r.year)].filter(v=>isFinite(v));
  const haveChart = all.length && yrs.length;
  let svg=null;
  if(haveChart){
    const x0=Math.min(...yrs), x1=Math.max(...yrs);
    let y0=Math.min(0,...all), y1=Math.max(...all)*1.05||1;
    const step=Math.pow(10,Math.floor(Math.log10((y1-y0)/4||1)))* ( ((y1-y0)/4)/Math.pow(10,Math.floor(Math.log10((y1-y0)/4||1)))<2?1:5 );
    const X=v=>L+(v-x0)/((x1-x0)||1)*(W-L-R), Y=v=>(H-B)-(v-y0)/((y1-y0)||1)*(H-T-B);
    const band = activeEnv.length? activeEnv.map((e,k)=>(k?"L":"M")+X(e.y).toFixed(1)+" "+Y(e.hi).toFixed(1)).join(" ")
      +" "+activeEnv.slice().reverse().map(e=>"L"+X(e.y).toFixed(1)+" "+Y(e.lo).toFixed(1)).join(" ")+" Z" : null;
    const medLine = activeEnv.length? activeEnv.map((e,k)=>(k?"L":"M")+X(e.y).toFixed(1)+" "+Y(e.med).toFixed(1)).join(" ") : null;
    const yt=[]; for(let v=Math.ceil(y0/step)*step; v<=y1; v+=step) yt.push(v);
    svg=(
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        <rect width={W} height={H} fill="#172029"/>
        {yt.map((v,i)=>(<g key={i}><line x1={L} y1={Y(v)} x2={W-R} y2={Y(v)} stroke="#2a3a47"/>
          <text x={L-7} y={Y(v)+4} textAnchor="end" fill="#b6c6d0" fontSize="12">{v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(0)}</text></g>))}
        <text x={L} y={T-6} fill="#cddbe4" fontSize="12.5" fontWeight="600">{unit||""}</text>
        {band && <path d={band} fill="#6aa9c0" opacity="0.15"/>}
        {medLine && <path d={medLine} fill="none" stroke="#6aa9c0" strokeWidth="1.8" strokeDasharray="5 3"/>}
        {rows.map((r,i)=>{ const m=medAt(activeEnv,r.year); const c=m==null?"#e8eef2":(r.value>=m?"#7bdca0":"#e6a23c");
          return <g key={i}><circle cx={X(r.year)} cy={Y(r.value)} r="3.4" fill={c} stroke="#0c1217" strokeWidth="0.8"><title>{`${r.label?r.label+" · ":""}${r.year}: ${r.value} ${unit||""}${m!=null?` (regional median ${m.toFixed(1)})`:""}`}</title></circle></g>; })}
        <text x={W-R} y={H-B+18} textAnchor="end" fill="#73879a" fontSize="10">{xmode==="age"?"stand age (yr)":"year"} · your stands vs {xmode==="age"?"landowner yield":stateName+" model"} median (dashed) + range (band)</text>
      </svg>);
  }

  const node = series && series[metric] && series[metric][bucket];
  return (
    <div style={{margin:"4px 4px 8px"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:6}}>
        <b style={{fontSize:13}}>Bring your own stands — {stateName}</b>
        <span style={{color:"var(--mut)",fontSize:11}}>plot your monitoring data against the multi-model envelope</span>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:8}}>
        <button onClick={()=>fileRef.current && fileRef.current.click()}
          style={{background:"var(--panel,#172029)",color:"var(--fg,#e8eef2)",border:"1px solid var(--line,#2a3a47)",borderRadius:6,padding:"5px 12px",fontSize:12.5,cursor:"pointer"}}>
          ↑ Upload CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{display:"none"}}/>
        {fname && <span style={{color:"var(--mut)",fontSize:11}}>{fname} · {rows.length} rows</span>}
        <span style={{display:"inline-flex",border:"1px solid var(--line,#2a3a47)",borderRadius:6,overflow:"hidden"}}>
          {["year","age"].map(m=>(
            <button key={m} onClick={()=>setXmode(m)}
              style={{background:xmode===m?"#2f6f5e":"transparent",color:xmode===m?"#eafff6":"var(--mut)",
                border:"none",padding:"4px 10px",fontSize:11.5,cursor:"pointer"}}>
              {m==="year"?"by year":"by age"}</button>))}
        </span>
        <span style={{color:"var(--mut)",fontSize:10.5}}>columns: a year (or age) column and a value column ({unit||"metric units"}); an optional stand id/label.</span>
      </div>
      {err && <div className="note" style={{color:"#e6a23c"}}>Could not read that file: {err}. Expecting a CSV with a year/age column and a value column.</div>}
      {xmode==="year" && !node && <div className="empty">No multi-model series for {stateName} in the current metric/management — pick a state and carbon metric to get a comparison envelope.</div>}
      {xmode==="age" && !ageEnv.length && <div className="note" style={{color:"#8aa0b0"}}>No landowner yield curves for {stateName} yet (currently Maine), so age-mode shows your stands without a reference band. The points still plot on a stand-age axis.</div>}

      {stats && (
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
          {[["Stands plotted", stats.n, ""],
            ["Above regional median", `${stats.pctAbove.toFixed(0)}%`, `${stats.above}/${stats.n}`],
            ["Mean deviation", `${stats.meanDev>=0?"+":""}${stats.meanDev.toFixed(0)}%`, "vs model median"]].map((c,i)=>(
            <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid var(--line,#2a3a47)",borderRadius:6,padding:"5px 10px",minWidth:120}}>
              <div style={{color:"var(--mut)",fontSize:10.5}}>{c[0]}</div>
              <div style={{fontSize:16,fontWeight:600}}>{c[1]} <span style={{fontSize:10,color:"var(--mut)",fontWeight:400}}>{c[2]}</span></div>
            </div>))}
        </div>
      )}
      {svg}
      <div style={{color:"var(--mut)",fontSize:10.5,marginTop:5,maxWidth:600,lineHeight:1.45}}>
        Upload runs entirely in your browser — nothing is sent anywhere. Each stand is shaded green if it sits above the state's cross-engine model median for its year, amber if below. The band is the full engine range for the current metric and management. Use this to sanity-check your inventory against the regional model ensemble.
      </div>
    </div>
  );
}
