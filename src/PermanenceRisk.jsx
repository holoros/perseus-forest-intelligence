// Permanence / reversal-risk view.
// PERSEUS already ships the disturbance-exposed and mortality-stressed reserve
// scenarios in the API (v1.4). This view contrasts the passive no-harvest
// reserve against those stressed siblings to answer the question competitor
// tools (e.g. carbon-reversal-risk) center on — but on PERSEUS's own
// multi-engine footing: how durable is stored carbon under elevated
// disturbance / mortality, and where does a no-harvest reserve plateau or
// turn into a net source?
import { useMemo, useState } from "react";
import PermanenceMap from "./PermanenceMap.jsx";

const BUCKETS = {
  base:  "reserve (no harvest)",
  dist:  "reserve (no harvest, disturbance-exposed)",
  mort:  "reserve (no harvest, mortality-stressed)",
};
const COL = { base:"#66c2a5", dist:"#e6a23c", mort:"#e05a5a" };

// carbon-stock metrics this view makes sense for, in preference order
const PREF = ["agc_live_total","agb_dry","agc_live_ag","bgc_live_total","vol_stem"];

// ensemble median of value-by-year across the engines in a bucket
function medianByYear(seriesArr){
  if(!seriesArr || !seriesArr.length) return [];
  const byYr = {};
  seriesArr.forEach(s => (s.pts||[]).forEach(p => {
    if(p[1]==null || isNaN(p[1])) return;
    (byYr[p[0]] = byYr[p[0]] || []).push(p[1]);
  }));
  return Object.keys(byYr).map(Number).sort((a,b)=>a-b).map(y=>{
    const v = byYr[y].slice().sort((a,b)=>a-b);
    const m = v.length%2 ? v[(v.length-1)/2] : (v[v.length/2-1]+v[v.length/2])/2;
    return [y, m, v.length];
  });
}
const valAt = (line, yr) => {
  if(!line.length) return null;
  if(yr<=line[0][0]) return line[0][1];
  if(yr>=line[line.length-1][0]) return line[line.length-1][1];
  for(let i=1;i<line.length;i++){ const a=line[i-1],b=line[i];
    if(yr>=a[0]&&yr<=b[0]){ const t=(yr-a[0])/((b[0]-a[0])||1); return a[1]+t*(b[1]-a[1]); } }
  return null;
};
const peak = line => line.reduce((m,p)=>p[1]>m?p[1]:m, -Infinity);

export default function PermanenceRisk({ series, state, meta, stateName, geo, risk, onPick }){
  // choose a carbon-stock metric that actually has the reserve buckets
  const metric = useMemo(()=>{
    if(!series) return null;
    for(const m of PREF){
      const node = series[m];
      if(node && node[BUCKETS.base] && (node[BUCKETS.dist] || node[BUCKETS.mort])) return m;
    }
    return null;
  }, [series]);

  const [hl, setHl] = useState(null);

  const data = useMemo(()=>{
    if(!metric) return null;
    const node = series[metric];
    const base = medianByYear(node[BUCKETS.base]);
    const dist = medianByYear(node[BUCKETS.dist]);
    const mort = medianByYear(node[BUCKETS.mort]);
    if(!base.length) return null;
    const endYr = base[base.length-1][0];
    const bEnd = base[base.length-1][1];
    const dEnd = dist.length ? valAt(dist, endYr) : null;
    const mEnd = mort.length ? valAt(mort, endYr) : null;
    // reversal = shortfall of the stressed reserve vs the passive reserve at horizon
    const distGap = dEnd!=null ? bEnd - dEnd : null;
    const mortGap = mEnd!=null ? bEnd - mEnd : null;
    const distPct = (distGap!=null && bEnd) ? distGap/bEnd*100 : null;
    const mortPct = (mortGap!=null && bEnd) ? mortGap/bEnd*100 : null;
    // does the disturbance-exposed reserve turn into a net source? (end below peak)
    const distPk = dist.length ? peak(dist) : null;
    const distDraw = (distPk!=null && dEnd!=null) ? (distPk - dEnd) : null;
    const distSource = (distDraw!=null && distPk) ? distDraw/distPk*100 : null;
    return { base, dist, mort, endYr, bEnd, dEnd, mEnd,
             distGap, mortGap, distPct, mortPct, distDraw, distSource,
             nEng: (node[BUCKETS.base]||[]).length };
  }, [metric, series]);

  if(!series) return <div className="empty">No model series for this state yet.</div>;
  if(!metric || !data)
    return <div className="empty">Permanence scenarios (disturbance-exposed / mortality-stressed reserve) are not available for {stateName||state} yet. They ship with the v1.4 carbon buckets — ME, GA, IN, MN and the focal states carry them.</div>;

  const unit = (meta && meta.metrics && meta.metrics[metric] && meta.metrics[metric].unit) || "Tg C";
  const label = (meta && meta.metrics && meta.metrics[metric] && meta.metrics[metric].label) || metric;

  // ---- chart geometry ----
  const W=560,H=300,L=52,R=120,T=16,B=30;
  const lines = [["base",data.base],["dist",data.dist],["mort",data.mort]].filter(([,l])=>l.length);
  const xs=[], ys=[];
  lines.forEach(([,l])=>l.forEach(p=>{ xs.push(p[0]); ys.push(p[1]); }));
  const x0=Math.min(...xs), x1=Math.max(...xs);
  let y0=0, y1=Math.max(...ys)*1.05||1;
  const range=(y1-y0)||1, rawStep=range/4, mag=Math.pow(10,Math.floor(Math.log10(rawStep)));
  const norm=rawStep/mag, step=(norm<1.5?1:norm<3?2:norm<7?5:10)*mag;
  y1=Math.ceil(y1/step-1e-9)*step;
  const X=v=>L+(v-x0)/((x1-x0)||1)*(W-L-R);
  const Y=v=>(H-B)-(v-y0)/((y1-y0)||1)*(H-T-B);
  const path=l=>l.map((p,k)=>(k?"L":"M")+X(p[0]).toFixed(1)+" "+Y(p[1]).toFixed(1)).join(" ");
  const yticks=[]; for(let v=0;v<=y1+step*1e-6;v+=step) yticks.push(+v.toFixed(6));
  const xticks=[]; { const span=x1-x0, rs=span/4, xm=Math.pow(10,Math.floor(Math.log10(rs||1)));
    const xn=(rs||1)/xm, xstep=Math.max(1,(xn<1.5?1:xn<3?2:xn<7?5:10)*xm);
    for(let t=Math.ceil(x0/xstep)*xstep;t<=x1+1e-6;t+=xstep) xticks.push(t); }

  // reversal gap polygon (between base and disturbance-exposed)
  let gapPoly=null;
  if(data.dist.length){
    const up=data.base.map((p,k)=>(k?"L":"M")+X(p[0]).toFixed(1)+" "+Y(p[1]).toFixed(1)).join(" ");
    const dn=data.base.slice().reverse().map(p=>"L"+X(p[0]).toFixed(1)+" "+Y(valAt(data.dist,p[0])).toFixed(1)).join(" ");
    gapPoly=up+" "+dn+" Z";
  }

  const verdict = (()=>{
    const dp=data.distPct, ds=data.distSource;
    const hi = (dp!=null && dp>=50) || (ds!=null && ds>=25);
    const mod = (dp!=null && dp>=20) || (ds!=null && ds>=8);
    const sourceNote = (ds!=null && ds>=8) ? ` The disturbance-exposed reserve peaks then draws down ${ds.toFixed(0)}% by ${data.endYr}, so it plateaus or turns into a partial net source rather than a durable sink.` : "";
    if(hi)
      return { t:"Reversal risk: high", d:`The disturbance-exposed reserve ends ${dp!=null?dp.toFixed(0):"—"}% below the passive reserve at ${data.endYr}.${sourceNote} Passive storage here is strongly conditional on disturbance staying near historical rates.`, c:"#e05a5a" };
    if(mod)
      return { t:"Reversal risk: moderate", d:`The disturbance-exposed reserve ends ${dp!=null?dp.toFixed(0):"—"}% below the passive reserve at ${data.endYr}.${sourceNote} Stored carbon is meaningfully sensitive to elevated disturbance.`, c:"#e6a23c" };
    return { t:"Reversal risk: lower", d:`The reserve holds most of its carbon under the stressed scenarios (within ${Math.max(dp||0,data.mortPct||0).toFixed(0)}% at ${data.endYr}). Durability is comparatively robust here.`, c:"#66c2a5" };
  })();

  const fmt=v=> v==null?"—": (Math.abs(v)>=100? v.toFixed(0): v.toFixed(1));

  return (
    <div style={{margin:"4px 4px 8px"}}>
      {geo && risk && (
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12.5,fontWeight:600,marginBottom:3}}>CONUS reversal risk</div>
          <PermanenceMap geo={geo} risk={risk} selected={state} onPick={onPick}/>
        </div>
      )}
      <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:4}}>
        <b style={{fontSize:13}}>Permanence &amp; reversal risk — {stateName||state}</b>
        <span style={{color:"var(--mut)",fontSize:11}}>{label} · ensemble median of {data.nEng} reserve engine{data.nEng===1?"":"s"} · {unit}</span>
      </div>

      <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"6px 0 8px"}}>
        <div style={{borderLeft:`3px solid ${verdict.c}`,padding:"3px 0 3px 9px",maxWidth:540}}>
          <div style={{color:verdict.c,fontSize:12.5,fontWeight:600}}>{verdict.t}</div>
          <div style={{color:"var(--mut)",fontSize:11.5,lineHeight:1.4}}>{verdict.d}</div>
        </div>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:6}}>
        {[["Passive reserve @"+data.endYr, fmt(data.bEnd), unit, COL.base],
          ["Disturbance-exposed", fmt(data.dEnd), data.distPct!=null?`▼ ${data.distPct.toFixed(0)}%`:"", COL.dist],
          ["Mortality-stressed", fmt(data.mEnd), data.mortPct!=null?`▼ ${data.mortPct.toFixed(0)}%`:"", COL.mort]].map((c,i)=>(
          <div key={i} style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${c[3]}55`,borderRadius:6,padding:"5px 9px",minWidth:120}}>
            <div style={{color:"var(--mut)",fontSize:10.5}}>{c[0]}</div>
            <div style={{fontSize:16,fontWeight:600,color:c[3],fontVariantNumeric:"tabular-nums"}}>{c[1]} <span style={{fontSize:9,color:"var(--mut)",fontWeight:400}}>{c[2]}</span></div>
            {c[3]!==COL.base && c[2] && <div style={{fontSize:10,color:c[3]}}>{c[2]}</div>}
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto"}}>
        {yticks.map((v,i)=>(<g key={"y"+i}>
          <line x1={L} y1={Y(v)} x2={W-R} y2={Y(v)} stroke="#2a3a47" strokeWidth="1"/>
          <text x={L-6} y={Y(v)+3} textAnchor="end" fill="#8aa0b0" fontSize="10">{v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(0)}</text>
        </g>))}
        {xticks.map((t,i)=>(<text key={"x"+i} x={X(t)} y={H-B+16} textAnchor="middle" fill="#8aa0b0" fontSize="10">{Math.round(t)}</text>))}
        <text x={L-6} y={T+2} textAnchor="end" fill="#6a7480" fontSize="9">{unit}</text>
        {gapPoly && <path d={gapPoly} fill={COL.dist} opacity={hl&&hl!=="dist"?0.04:0.14} stroke="none"/>}
        {lines.map(([k,l])=>(
          <path key={k} d={path(l)} fill="none" stroke={COL[k]}
            strokeWidth={k==="base"?2.2:1.8} strokeDasharray={k==="base"?"0":"6 3"}
            opacity={hl&&hl!==k?0.25:0.95}
            onMouseEnter={()=>setHl(k)} onMouseLeave={()=>setHl(null)}
            style={{cursor:"pointer"}}/>
        ))}
        {/* end labels */}
        {lines.map(([k,l])=>{
          const last=l[l.length-1];
          const txt={base:"passive reserve",dist:"disturbance-exposed",mort:"mortality-stressed"}[k];
          return <g key={"lab"+k} style={{pointerEvents:"none"}}>
            <line x1={W-R+1} y1={Y(last[1])} x2={W-R+5} y2={Y(last[1])} stroke={COL[k]} strokeWidth="1.5" strokeDasharray={k==="base"?"0":"4 2"}/>
            <text x={W-R+7} y={Y(last[1])+3} fill={COL[k]} fontSize="8.5">{txt}</text>
          </g>;
        })}
      </svg>

      <div style={{color:"var(--mut)",fontSize:10.5,lineHeight:1.45,marginTop:4,maxWidth:560}}>
        Reversal risk is the shortfall of a stressed no-harvest reserve against the passive reserve at {data.endYr}. The disturbance-exposed band spans historical / 2× / 3× disturbance frequency (FIA COND + GRM grounded); mortality-stressed elevates background mortality. Hover a line to isolate. Unlike single-model reversal tools, this is the cross-engine reserve median, so the risk read carries PERSEUS's multi-model spread.
      </div>
    </div>
  );
}
