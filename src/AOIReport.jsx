// AOI summary + forward projection. Given an area of interest (uploaded polygon
// or an inspected point) it summarizes: size, encompassing EPA L3 ecoregion,
// FIA-derived forest attributes and landowner composition for plots inside the
// polygon (where available), and the ycx yield trajectory (untreated vs
// harvested) from yield_curves_by_l3.
import React, { useState, useEffect } from "react";
import MiniChart from "./MiniChart.jsx";
import StandOutlook from "./StandOutlook.jsx";
import { openReport } from "./report.js";
import { conv, fmtArea as fmtAreaU } from "./units.js";

const valAt = (curve, age) => { const h = (curve||[]).find(([a])=>a===age); return h?h[1]:null; };
const fmtArea = (m2) => {
  if(!m2) return null;
  const ac = m2 / 4046.8564224, ha = m2 / 1e4;
  return ac >= 1000 ? `${Math.round(ac).toLocaleString()} ac (${Math.round(ha).toLocaleString()} ha)`
                    : `${ac.toFixed(0)} ac (${ha.toFixed(0)} ha)`;
};
const OWN_COL = { "Private (Family/Corporate)":"#3fb68b", "State / Local":"#6baed6",
  "National Forest":"#8da0cb", "Other Federal":"#3C5488", "Tribal":"#8c510a" };
const FT_PALETTE = ["#3fb68b","#6baed6","#e6ab02","#d95f02","#8da0cb","#a6761d"];
// Band coloring. Risk: low=good(green). Habitat/biodiversity: high=good(green).
const BAND_GOOD_HIGH = { "High":"#3fb68b", "Moderate":"#e6ab02", "Low":"#d9734f" };
const BAND_GOOD_LOW  = { "Low":"#3fb68b", "Moderate":"#e6ab02", "High":"#d9534f" };

// Six outcome axes (all "high = good"). `pctl` = displayed as ecoregion
// percentile; biodiversity is an absolute stand-diversity index. Each index[k]
// is an object { v, lo, hi, ref }: v = AOI percentile, lo/hi = interquartile
// spread (error bar), ref = encompassing-state mean percentile (comparison).
const AXES6 = [
  ["carbon","Carbon",true], ["value","Timber value",true],
  ["productivity","Productivity",true], ["resilience","Resilience",true],
  ["habitat","Habitat",true], ["biodiversity","Biodiversity",false],
];
const IDX_NAMES = { carbon:"carbon", value:"timber value", productivity:"productivity",
  habitat:"habitat", biodiversity:"biodiversity", resilience:"resilience" };
const axV = x => (x && typeof x==="object") ? x.v : x;   // tolerate number or {v,...}

// Plain-language read: highest/lowest-ranked outcome within the ecoregion.
function radarNarrative(index){
  if(!index) return null;
  const good = Object.entries(index).filter(([k,v])=>k!=="biodiversity" && axV(v)!=null)
    .map(([k,v])=>[k,axV(v)]).sort((a,b)=>b[1]-a[1]);
  if(good.length < 2) return null;
  const hi = good[0], lo = good[good.length-1];
  const res = index.resilience!=null ? ` Resilience to disturbance sits around the ${Math.round(axV(index.resilience)*100)}th percentile.` : "";
  return `Within its ecoregion this area ranks highest on ${IDX_NAMES[hi[0]]} (${Math.round(hi[1]*100)}th pct) and lowest on ${IDX_NAMES[lo[0]]} (${Math.round(lo[1]*100)}th pct).${res}`;
}

// Letter grade + color from a percentile (0..1). Centered so the regional
// median (~0.5) reads as a C: top of region = A, bottom = F.
const GRADE = p => p==null ? null
  : p>=0.80 ? {letter:"A", color:"#2e9e6b"}
  : p>=0.60 ? {letter:"B", color:"#5cb85c"}
  : p>=0.40 ? {letter:"C", color:"#e6ab02"}
  : p>=0.20 ? {letter:"D", color:"#e08a3c"}
  :           {letter:"F", color:"#d9534f"};

// Composite scorecard: one overall letter grade from the region-relative axes,
// plus a per-axis colored letter chip. Each chip's tooltip compares the AOI to
// the ecoregion median (50th by construction) and the state average (ref), so
// the comparison the user asked for is explicit and rankable.
function Scorecard({ index }){
  if(!index) return null;
  const axes = AXES6.filter(([k]) => axV(index[k])!=null);
  if(axes.length < 3) return null;
  const vals = axes.map(([k]) => axV(index[k]));
  const comp = vals.reduce((a,b)=>a+b,0)/vals.length;
  const g = GRADE(comp);
  return (
    <div style={{display:"flex",alignItems:"center",gap:11,margin:"2px 6px 8px"}}>
      <div title={`Composite of ${axes.length} region-relative outcomes`} style={{flex:"0 0 auto",
        width:48,height:48,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",
        background:g.color+"22",border:`2px solid ${g.color}`}}>
        <span style={{fontSize:25,fontWeight:700,color:g.color,lineHeight:1}}>{g.letter}</span>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:"var(--ink)",fontWeight:600}}>
          Overall {ord(Math.round(comp*100))} percentile in its ecoregion
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"3px 5px",marginTop:3}}>
          {axes.map(([k,lab]) => { const o=index[k], v=axV(o), gg=GRADE(v);
            const tip = (o && o.ref!=null)
              ? `${lab}: this area ${ord(Math.round(v*100))} · state avg ${ord(Math.round(o.ref*100))} · ecoregion median 50th`
              : `${lab}: this area ${ord(Math.round(v*100))} pct of ecoregion`;
            return <span key={k} title={tip} style={{fontSize:10.5,padding:"1px 7px",borderRadius:9,
              background:gg.color+"22",color:gg.color,border:`1px solid ${gg.color}66`,whiteSpace:"nowrap"}}>
              {lab} {gg.letter}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Current -> future projection from the ecoregion reserve/managed yield
// curves (l3 curves: `untreated` = reserve, `harvested` = managed). Each radar
// axis with a matching curve is nudged from its current percentile in the
// direction and relative magnitude the chosen pathway implies over the horizon.
// This is a scenario DIRECTION sketch grounded in the ecoregion curves, not a
// re-ranked percentile; axes without a curve are held at current.
const AXIS_CURVE = { carbon:"carbon_lbac", resilience:"ba_ft2ac" };
const FUT_COL = { reserve:"#2e9e6b", managed:"#d98a3c" };
function curveAt(series, age){
  if(!series || !series.length) return null;
  if(age <= series[0][0]) return series[0][1];
  if(age >= series[series.length-1][0]) return series[series.length-1][1];
  for(let i=1;i<series.length;i++){
    if(age <= series[i][0]){ const [a0,v0]=series[i-1],[a1,v1]=series[i];
      const f=(age-a0)/((a1-a0)||1); return v0+f*(v1-v0); } }
  return series[series.length-1][1];
}
function projectFuture(index, allCurves, age0, horizon, pathway){
  if(!index || !allCurves) return null;
  const key = pathway==="managed" ? "harvested" : "untreated";
  const a0 = (age0!=null && age0>0) ? age0 : 40, a1 = a0 + horizon;
  const out = {};
  for(const axk of Object.keys(index)){
    const cur = axV(index[axk]);
    if(cur==null){ out[axk]=null; continue; }
    // carbon / resilience: project the pathway forward against the CURRENT
    // (untreated, present-age) baseline, so the change is "from where it is now".
    const cname = AXIS_CURVE[axk];
    if(cname && allCurves[cname] && allCurves[cname].untreated && allCurves[cname][key]){
      const v0 = curveAt(allCurves[cname].untreated, a0), v1 = curveAt(allCurves[cname][key], a1);
      if(v0!=null && v1!=null && v0>0){
        const frac = (v1-v0)/v0, dir = axk==="resilience" ? -1 : 1;   // denser than now -> less resilience
        out[axk] = { v: Math.max(0,Math.min(1, cur + 0.42*Math.tanh(2*frac)*dir)), held:false };
        continue;
      }
    }
    // value: managed realizes income (up, scaled by merchantable share); reserve defers (held)
    if(axk==="value"){
      if(pathway==="managed" && allCurves.merchvol_cuftac && allCurves.voltot_cuftac){
        const mv = curveAt(allCurves.merchvol_cuftac.harvested, a1),
              tv = curveAt(allCurves.voltot_cuftac.harvested, a1);
        const share = (mv!=null && tv>0) ? Math.max(0,Math.min(1, mv/tv)) : 0.4;
        out[axk] = { v: Math.max(0,Math.min(1, cur + 0.30*share)), held:false };
        continue;
      }
    }
    out[axk] = { v: cur, held:true };
  }
  return out;
}

// Interactive 6-axis radar. Each percentile axis = this area's rank within its
// ecoregion (50% ring = regional median). "Compare to" chips overlay the
// surrounding area and state average; the "Outlook" row morphs the radar to a
// reserve or managed future. Hover a point for its value.
function ConditionRadar({ index, allCurves, age0 }){
  const [hi, setHi] = useState(null);
  const [ctx, setCtx] = useState({ surrounding:false, state:true });
  const [pathway, setPathway] = useState(null);   // null | "reserve" | "managed"
  const [horizon, setHorizon] = useState(30);
  if(!index) return null;
  const N = AXES6.length, C = 110, R = 74;
  const ang = i => (-90 + i*360/N) * Math.PI/180;
  const pt = (i, r) => [C + r*Math.cos(ang(i)), C + r*Math.sin(ang(i))];
  const clamp = v => v==null ? null : Math.max(0,Math.min(1,v));
  const ax = i => index[AXES6[i][0]];
  const val = i => { const v = clamp(axV(ax(i))); return v==null ? 0 : v; };
  const hasRef = AXES6.some((_,i)=>{ const a=ax(i); return a && a.ref!=null; });
  const hasBroad = AXES6.some((_,i)=>{ const a=ax(i); return a && a.bv!=null; });
  const canFuture = !!allCurves;
  const future = (pathway && canFuture) ? projectFuture(index, allCurves, age0, horizon, pathway) : null;
  const rings = [0.25,0.5,0.75,1].map((f,k) =>
    <circle key={k} cx={C} cy={C} r={R*f} fill="none"
      stroke={f===0.5?"#6a8190":"var(--line)"} strokeWidth={f===0.5?1:0.6}
      strokeDasharray={f===0.5?"3 3":"0"}/>);
  const spokes = AXES6.map((_,i) => { const [x,y]=pt(i,R);
    return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--line)" strokeWidth="0.6"/>; });
  // comparison polygon (encompassing state mean within the ecoregion)
  const refPoly = (ctx.state && hasRef) ? AXES6.map((_,i) => { const a=ax(i); const r=a&&a.ref!=null?clamp(a.ref):0;
    return pt(i, R*r).map(n=>n.toFixed(1)).join(","); }).join(" ") : null;
  // surrounding-area polygon (broader concentric AOI, percentile within ecoregion)
  const broadPoly = (ctx.surrounding && hasBroad) ? AXES6.map((_,i) => { const a=ax(i); const r=a&&a.bv!=null?clamp(a.bv):0;
    return pt(i, R*r).map(n=>n.toFixed(1)).join(","); }).join(" ") : null;
  // future polygon (chosen pathway + horizon)
  const futPoly = future ? AXES6.map(([k],i) => { const f=future[k]; const r=f?clamp(f.v):0;
    return pt(i, R*r).map(n=>n.toFixed(1)).join(","); }).join(" ") : null;
  const futMoved = future ? AXES6.map(([k],i) => (future[k] && !future[k].held) ? i : null).filter(i=>i!=null) : [];
  const poly = AXES6.map((_,i) => pt(i, R*val(i)).map(n=>n.toFixed(1)).join(",")).join(" ");
  // error bars: radial segment from lo to hi percentile on each spoke
  const ebars = AXES6.map((_,i) => { const a=ax(i);
    if(!a || a.lo==null || a.hi==null || a.lo===a.hi) return null;
    const [x1,y1]=pt(i, R*clamp(a.lo)), [x2,y2]=pt(i, R*clamp(a.hi));
    const cap=2.4, nx=Math.cos(ang(i)+Math.PI/2)*cap, ny=Math.sin(ang(i)+Math.PI/2)*cap;
    return <g key={"e"+i} stroke="#bfe6cf" strokeWidth="1.1" opacity="0.8">
      <line x1={x1} y1={y1} x2={x2} y2={y2}/>
      <line x1={x1-nx} y1={y1-ny} x2={x1+nx} y2={y1+ny}/>
      <line x1={x2-nx} y1={y2-ny} x2={x2+nx} y2={y2+ny}/></g>; });
  const labels = AXES6.map(([k,lab],i) => { const [x,y]=pt(i, R+15);
    const anc = Math.abs(x-C)<5 ? "middle" : (x>C ? "start" : "end");
    return <text key={k} x={x} y={y+3} textAnchor={anc} fontSize="9.5"
      fill={axV(ax(i))!=null?"var(--ink)":"#5e7180"}>{lab}</text>; });
  const dots = AXES6.map((_,i) => { const [x,y]=pt(i, R*val(i));
    return <circle key={i} cx={x} cy={y} r={hi===i?4.2:3} fill="#3fb68b" stroke="#0b1015" strokeWidth="0.5"/>; });
  const hits = AXES6.map((_,i) => { const [x,y]=pt(i, R*val(i));
    return <circle key={"h"+i} cx={x} cy={y} r="11" fill="transparent" style={{cursor:"pointer"}}
      onMouseEnter={()=>setHi(i)} onMouseLeave={()=>setHi(null)}/>; });
  let tip = null;
  if(hi!=null){ const [k,lab,pctl]=AXES6[hi]; const a=ax(hi); const v=axV(a); const [x,y]=pt(hi, R*val(hi));
    const band = (a&&a.lo!=null&&a.hi!=null&&a.lo!==a.hi) ? ` (${Math.round(a.lo*100)}–${Math.round(a.hi*100)})` : "";
    const refTxt = (a&&a.ref!=null) ? ` · state ${Math.round(a.ref*100)}th` : "";
    const txt = v==null ? `${lab}: n/a`
      : pctl ? `${lab}: ${Math.round(v*100)}th pct${band}${refTxt}`
             : `${lab}: ${Math.round(v*100)}% (stand index)`;
    const w = txt.length*4.7 + 10, tx = Math.max(2, Math.min(220-w, x-w/2));
    tip = <g style={{pointerEvents:"none"}}>
      <rect x={tx} y={y-22} width={w} height="15" rx="3" fill="rgba(15,20,25,0.94)" stroke="var(--line)"/>
      <text x={tx+5} y={y-11} fontSize="9" fill="#e8eef2">{txt}</text></g>;
  }
  const chip = (on, col) => ({ fontSize:11, padding:"2px 8px", borderRadius:9, cursor:"pointer",
    border:`1px solid ${on?(col||"#3fb68b"):"var(--line)"}`, background:on?((col||"#3fb68b")+"22"):"transparent",
    color:on?(col||"#3fb68b"):"var(--mut)", whiteSpace:"nowrap", userSelect:"none" });
  const futCol = pathway ? FUT_COL[pathway] : "#3fb68b";
  const legend = [
    ["this area", "#3fb68b", false],
    (ctx.surrounding && hasBroad) && ["surrounding", "#7a9bd6", true],
    (ctx.state && hasRef) && ["state avg", "#9aa7b0", true],
    future && [`${pathway} +${horizon}y`, futCol, true],
  ].filter(Boolean);
  return (
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 6px",alignItems:"center",margin:"0 6px 2px"}}>
        <span style={{fontSize:10.5,color:"#5e7180"}}>Compare to:</span>
        {hasBroad && <span style={chip(ctx.surrounding,"#7a9bd6")} onClick={()=>setCtx(c=>({...c,surrounding:!c.surrounding}))}>Surrounding</span>}
        {hasRef && <span style={chip(ctx.state,"#9aa7b0")} onClick={()=>setCtx(c=>({...c,state:!c.state}))}>State avg</span>}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 6px",alignItems:"center",margin:"0 6px 2px"}}>
        <span style={{fontSize:10.5,color:"#5e7180"}}>Outlook:</span>
        <span style={chip(pathway===null)} onClick={()=>setPathway(null)}>Now</span>
        <span style={chip(pathway==="reserve",FUT_COL.reserve)} title={canFuture?"":"ecoregion curves unavailable here"}
          onClick={()=>canFuture&&setPathway(pathway==="reserve"?null:"reserve")}>Reserve</span>
        <span style={chip(pathway==="managed",FUT_COL.managed)} title={canFuture?"":"ecoregion curves unavailable here"}
          onClick={()=>canFuture&&setPathway(pathway==="managed"?null:"managed")}>Managed</span>
        {pathway && <>
          <span style={chip(horizon===30)} onClick={()=>setHorizon(30)}>+30y</span>
          <span style={chip(horizon===50)} onClick={()=>setHorizon(50)}>+50y</span>
        </>}
      </div>
      <svg viewBox="0 0 220 228" style={{width:"100%",maxWidth:290,display:"block",margin:"0 auto"}}>
        {rings}{spokes}
        {refPoly && <polygon points={refPoly} fill="none" stroke="#9aa7b0" strokeWidth="1.1" strokeDasharray="4 3" opacity="0.85"/>}
        {broadPoly && <polygon points={broadPoly} fill="none" stroke="#7a9bd6" strokeWidth="1.2" strokeDasharray="2 2" opacity="0.9"/>}
        {futPoly && <polygon points={futPoly} fill={futCol} fillOpacity="0.10" stroke={futCol} strokeWidth="1.5" strokeDasharray="5 3"/>}
        <polygon points={poly} fill="#3fb68b" fillOpacity={future?"0.10":"0.20"} stroke="#3fb68b" strokeWidth="1.8"/>
        {futPoly && futMoved.map(i => { const [x,y]=pt(i, R*clamp(future[AXES6[i][0]].v));
          return <circle key={"f"+i} cx={x} cy={y} r="2.6" fill={futCol} stroke="#0b1015" strokeWidth="0.5"/>; })}
        {ebars}{dots}{labels}{hits}{tip}
      </svg>
      <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:"2px 10px",margin:"1px 0 0"}}>
        {legend.map(([lab,col,dash],k)=>(
          <span key={k} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:8.5,color:"#5e7180"}}>
            <svg width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke={col} strokeWidth={dash?"1.2":"1.8"} strokeDasharray={dash?"3 2":"0"}/></svg>{lab}</span>
        ))}
      </div>
    </div>
  );
}

// Observed RD trajectory (2016/2020/2022 TreeMap-basis). Shades the 0.30–0.60
// management sweet spot (max growth, min mortality/risk) and flags where the
// area's latest RD sits relative to it.
const RD_LO = 0.30, RD_HI = 0.60;
function RDTrajectory({ series }){
  if(!series || series.length < 2) return null;
  const pts = series.filter(p=>p.rd!=null);
  if(pts.length < 2) return null;
  const W=260, H=120, ml=30, mr=46, mt=10, mb=20;
  const x0=ml, x1=W-mr, y0=mt, y1=H-mb;
  const yMax = Math.max(0.9, ...pts.map(p=>p.rd))*1.05;
  const yr0=2016, yr1=2022;
  const sx = yr => x0 + (yr-yr0)/(yr1-yr0)*(x1-x0);
  const sy = rd => y1 - (rd/yMax)*(y1-y0);
  const line = pts.map(p=>`${sx(p.year).toFixed(1)},${sy(p.rd).toFixed(1)}`).join(" ");
  const latest = pts[pts.length-1].rd;
  const inBand = latest>=RD_LO && latest<=RD_HI;
  const pos = latest<RD_LO ? "below" : latest>RD_HI ? "above" : "within";
  const msg = pos==="within"
    ? `Latest RD ${latest.toFixed(2)} sits in the 0.30–0.60 sweet spot — near-optimal growth with low density-driven mortality.`
    : pos==="below"
    ? `Latest RD ${latest.toFixed(2)} is below the 0.30–0.60 sweet spot — understocked; growing space is available.`
    : `Latest RD ${latest.toFixed(2)} is above the 0.30–0.60 sweet spot — dense; competition raises mortality and disturbance risk (a thinning candidate).`;
  return (
    <div style={{margin:"4px 6px 6px"}}>
      <div className="aoi-sub" style={{borderTop:"none",marginTop:2}}>Relative density over time · 2016 → 2022</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:340,display:"block",margin:"0 auto"}}>
        <rect x={x0} y={sy(RD_HI)} width={x1-x0} height={sy(RD_LO)-sy(RD_HI)} fill="#3fb68b" opacity="0.13"/>
        <line x1={x0} y1={sy(RD_HI)} x2={x1} y2={sy(RD_HI)} stroke="#3fb68b" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.6"/>
        <line x1={x0} y1={sy(RD_LO)} x2={x1} y2={sy(RD_LO)} stroke="#3fb68b" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.6"/>
        <text x={x1+3} y={sy(0.45)+3} fontSize="8" fill="#3fb68b">sweet spot</text>
        <text x={x1+3} y={sy(0.45)+13} fontSize="7.5" fill="#5e7180">0.30–0.60</text>
        <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="var(--line)" strokeWidth="0.6"/>
        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="var(--line)" strokeWidth="0.6"/>
        {[0,0.3,0.6,0.9].filter(t=>t<=yMax).map((t,k)=>(
          <text key={k} x={x0-4} y={sy(t)+3} fontSize="8" textAnchor="end" fill="#5e7180">{t.toFixed(1)}</text>
        ))}
        <polyline points={line} fill="none" stroke="#1d7e0f" strokeWidth="1.8"/>
        {pts.map((p,k)=>(<g key={k}>
          <circle cx={sx(p.year)} cy={sy(p.rd)} r="3.2" fill={inBand&&k===pts.length-1?"#3fb68b":"#1d7e0f"} stroke="#0b1015" strokeWidth="0.5"/>
          <text x={sx(p.year)} y={y1+12} fontSize="8.5" textAnchor="middle" fill="#5e7180">{p.year}</text>
          <text x={sx(p.year)} y={sy(p.rd)-6} fontSize="8" textAnchor="middle" fill="var(--ink)">{p.rd.toFixed(2)}</text>
        </g>))}
      </svg>
      <div className="note" style={{margin:"2px 0 0"}}>{msg} <i style={{opacity:.7,fontStyle:"normal"}}>RD from TreeMap-basis overlays; the band reflects density-management guidance.</i></div>
    </div>
  );
}

// Observed structure trajectory (quadratic mean diameter, stand height, stocking)
// over 2016 / 2020 / 2022 from the TreeMap-basis overlays. Each metric is a small
// auto-scaled sparkline with its latest value and direction of change, giving the
// "what is here now" read a short history beside the RD trajectory.
function StructureTrajectory({ series }){
  if(!series) return null;
  const keys = Object.keys(series).filter(k => series[k] && series[k].pts);
  if(!keys.length) return null;
  const W=240, H=34, ml=4, mr=52, mt=5, mb=5;
  const x0=ml, x1=W-mr, y0=mt, y1=H-mb;
  const sx = yr => x0 + (yr-2016)/(2022-2016)*(x1-x0);
  return (
    <div style={{margin:"4px 6px 6px"}}>
      <div className="aoi-sub" style={{borderTop:"none",marginTop:2}}>Forest structure over time · 2016 → 2022</div>
      {keys.map(k => {
        const { label, pts } = series[k];
        const v = pts.filter(p=>p.v!=null);
        if(v.length < 2) return null;
        const vals = v.map(p=>p.v), lo=Math.min(...vals), hi=Math.max(...vals), span=(hi-lo)||1;
        const sy = val => y1 - ((val-lo)/span)*(y1-y0);
        const line = v.map(p=>`${sx(p.year).toFixed(1)},${sy(p.v).toFixed(1)}`).join(" ");
        const first=v[0].v, last=v[v.length-1].v, d=last-first;
        const thr = 0.03*Math.abs(first||1);
        const arrow = d>thr ? "↑" : d<-thr ? "↓" : "→";
        const col = d>thr ? "#1d7e0f" : d<-thr ? "#d9734f" : "#5e7180";
        return (
          <div key={k} style={{display:"flex",alignItems:"center",gap:6,margin:"1px 0"}}>
            <span style={{fontSize:11,minWidth:86,color:"var(--ink)"}}>{label}</span>
            <svg viewBox={`0 0 ${W} ${H}`} style={{flex:1,height:24}}>
              <polyline points={line} fill="none" stroke="#1d7e0f" strokeWidth="1.6"/>
              {v.map((p,i)=>(<circle key={i} cx={sx(p.year)} cy={sy(p.v)} r="2.3" fill="#1d7e0f"/>))}
              <text x={x1+5} y={(y0+y1)/2+3.5} fontSize="10.5" fill={col}>{last} {arrow}</text>
            </svg>
          </div>
        );
      })}
      <div className="note" style={{margin:"2px 0 0"}}>Quadratic mean diameter, stand height, and stocking from TreeMap-basis overlays.</div>
    </div>
  );
}

// Priorities dial. The user weights what they care about and the area's outcomes
// combine into one region-relative "priority-fit" score, a ranked contribution
// list, and a rule-based management leaning. All axes already read "high = good"
// (resilience is the inverted-risk axis), so no per-axis inversion is needed.
// This is the user-prioritized dial of the multi-objective thesis: the same
// area scores differently — and earns a different recommendation — depending on
// what the landowner values.
const PRIO = [
  ["carbon","Carbon"], ["value","Timber income"], ["productivity","Productivity"],
  ["habitat","Habitat"], ["biodiversity","Biodiversity"], ["resilience","Resilience"],
];
const fitBand = f => f==null?null : f<0.34?"Low":f<0.67?"Moderate":"High";
const FIT_COL = { "High":"#3fb68b", "Moderate":"#e6ab02", "Low":"#d9734f" };
const ord = n => { const s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };

// One plain-language takeaway at the top of an AOI: forest type, stocking read,
// the strongest region-relative outcome, and a management cue. Built only from
// fields already computed, so it never invents data.
const IDX_LABEL = { carbon:"carbon", value:"timber value", productivity:"productivity",
  habitat:"habitat", biodiversity:"biodiversity", resilience:"resilience" };
function plainHeadline(aoi){
  const ls = aoi.landscape; if(!ls) return null;
  const parts = [];
  // dominant forest type (FIA plots preferred, else CONUS fortype)
  const ft = aoi.plotStats && aoi.plotStats.forestTypes && aoi.plotStats.forestTypes[0];
  if(ft && ft.label && ft.label.toLowerCase()!=="nonforest") parts.push(ft.label);
  // stocking / density read from the RD trajectory's latest point
  let rdCue = null;
  if(ls.rdSeries && ls.rdSeries.length){
    const last = ls.rdSeries.filter(p=>p.rd!=null).pop();
    if(last){ const rd=last.rd;
      const word = rd>0.60 ? "dense" : rd<0.30 ? "understocked" : "well stocked";
      parts.push(`${word} (RD ${rd.toFixed(2)})`);
      rdCue = rd>0.60 ? "a thinning candidate" : rd<0.30 ? "room to grow" : null;
    }
  }
  // strongest region-relative outcome
  if(ls.index){
    const good = Object.entries(ls.index).filter(([k,v])=>k!=="biodiversity" && axV(v)!=null)
      .map(([k,v])=>[k,axV(v)]).sort((a,b)=>b[1]-a[1]);
    if(good.length){ const hi=good[0];
      parts.push(`high ${IDX_LABEL[hi[0]]} for its region (${ord(Math.round(hi[1]*100))} pct)`); }
  }
  if(!parts.length) return null;
  let s = parts.join(", ");
  if(rdCue) s += `. ${rdCue.charAt(0).toUpperCase()+rdCue.slice(1)}.`;
  else s += ".";
  return s;
}

// Rule-based pathway recommendation from the weighted profile. Groups outcomes
// into a production lean (income + productivity) and a conservation lean (carbon
// + habitat + biodiversity), modulated by how the area actually ranks and how
// much weight resilience carries.
function recommendPathway(rows){
  // rows: [{k,lab,g,wt}] with wt>0 only
  const tot = rows.reduce((a,r)=>a+r.wt,0) || 1;
  const wOf = ks => rows.filter(r=>ks.includes(r.k)).reduce((a,r)=>a+r.wt,0)/tot;
  const gOf = k => { const r=rows.find(x=>x.k===k); return r?r.g:null; };
  const prod = wOf(["value","productivity"]);
  const cons = wOf(["carbon","habitat","biodiversity"]);
  const resW = wOf(["resilience"]);
  const resG = gOf("resilience");
  let lean, why;
  if(prod > cons + 0.12){
    const strong = (gOf("value")??0) >= 0.5 || (gOf("productivity")??0) >= 0.5;
    lean = "Actively managed";
    why = strong
      ? "your weights favor income and productivity, and this area ranks well on them — it can support a managed timber rotation."
      : "your weights favor income and productivity, but this area ranks low on them for its region — returns may be modest; weigh against sites that rank higher.";
  } else if(cons > prod + 0.12){
    lean = "Reserve / light-touch";
    why = "your weights favor carbon, habitat, and biodiversity — a reserve or light-touch regime preserves standing stocks and structure.";
  } else {
    lean = "Climate-smart (balanced)";
    why = "you weight production and conservation comparably — a climate-smart regime (partial harvest, retention, longer rotations) balances income against carbon and habitat.";
  }
  // Resilience override: if resilience matters and the area is fragile, fold in
  // risk-reduction regardless of the production/conservation balance.
  if(resW >= 0.18 && resG!=null && resG < 0.4){
    why += " Because resilience is a priority and this area ranks low on it, add risk-reduction treatments (thinning to the 0.30–0.60 RD sweet spot, fuels work).";
  }
  return { lean, why };
}

function PriorityDial({ index }){
  const init = {}; PRIO.forEach(([k])=>{ init[k]=1; });
  const [w, setW] = useState(init);
  if(!index) return null;
  const avail = PRIO.filter(([k]) => axV(index[k])!=null);
  if(avail.length < 2) return null;
  let num=0, den=0; const rows=[];
  for(const [k,lab] of avail){
    const g = axV(index[k]); if(g==null) continue;
    const wt = w[k]; num += g*wt; den += wt;
    rows.push({ k, lab, g, wt });
  }
  const fit = den>0 ? num/den : null;
  const band = fitBand(fit);
  const active = rows.filter(r=>r.wt>0).slice().sort((a,b)=> (b.g*b.wt)-(a.g*a.wt));
  const rec = den>0 ? recommendPathway(rows.filter(r=>r.wt>0)) : null;
  const setk = (k,val) => setW(p=>({...p,[k]:val}));
  return (
    <div style={{margin:"4px 6px 6px"}}>
      <div className="aoi-sub" style={{borderTop:"none",marginTop:2}}>What do you value? · priorities</div>
      <div className="note" style={{margin:"0 0 3px"}}>Slide what matters; the fit, ranking, and recommendation update live.</div>
      <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:"3px 8px",alignItems:"center"}}>
        {avail.map(([k,lab]) => (
          <React.Fragment key={k}>
            <span style={{fontSize:11.5,color:"var(--ink)"}}>{lab}</span>
            <input type="range" min="0" max="3" step="1" value={w[k]}
              onChange={e=>setk(k, +e.target.value)} style={{width:"100%",accentColor:"#3fb68b"}}/>
            <span style={{fontSize:10.5,color:"#5e7180",width:34,textAlign:"right"}}>
              {["off","×1","×2","×3"][w[k]]}</span>
          </React.Fragment>
        ))}
      </div>
      {fit!=null && den>0 && (
        <div style={{marginTop:6}}>
          <div className="aoi-bar-row" title="Weighted region-relative fit across the outcomes you value">
            <span className="aoi-bar-lab" style={{fontWeight:600}}>Priority fit</span>
            <span className="aoi-bar-track"><span className="aoi-bar-fill"
              style={{width:`${fit*100}%`, background: FIT_COL[band] || "#888"}}/></span>
            <span className="aoi-bar-pct" style={{color:FIT_COL[band]}}>{Math.round(fit*100)}th</span>
          </div>
          {active.length>0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:"3px 5px",margin:"4px 0 2px"}}>
              {active.map((r,i)=>(
                <span key={r.k} style={{fontSize:10.5,padding:"1px 6px",borderRadius:9,
                  background:i===0?"rgba(63,182,139,0.18)":"rgba(120,140,150,0.13)",
                  color:i===0?"#bfe6cf":"#9fb0ba",border:"1px solid var(--line)"}}>
                  {r.lab} {ord(Math.round(r.g*100))}
                </span>
              ))}
            </div>
          )}
          {rec && (
            <div className="note" style={{margin:"3px 0 0"}}>
              For your priorities, lean <b style={{color:"var(--ink)"}}>{rec.lean}</b> — {rec.why}
            </div>
          )}
        </div>
      )}
      {den===0 && <div className="note" style={{margin:"2px 0 0"}}>Set a weight above to see your priority fit and recommendation.</div>}
    </div>
  );
}

// ---- Multi-model agreement. The AOI's encompassing state carries a cross-engine
// ensemble for above-ground live carbon at the divergence target year. Instead of
// one projection, show the ensemble mean, the across-model range, and how the model
// families (CBM, CEM, FVS, LANDIS, yield curves) place along it, so the structural
// uncertainty is explicit. Data: api/engine_divergence.json.
const FAMILY_COL = { CBM:"#3fb68b", CEM:"#6baed6", FVS:"#e6ab02", LANDIS:"#d95f02", YC:"#8da0cb" };
const FAMILY_LAB = { CBM:"CBM", CEM:"CEM", FVS:"FVS", LANDIS:"LANDIS", YC:"Yield curves" };
function ModelAgreement({ state }){
  const [div, setDiv] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(import.meta.env.BASE_URL + "api/engine_divergence.json")
      .then(r => r.ok ? r.json() : null).then(d => { if(alive) setDiv(d); }).catch(()=>{});
    return () => { alive = false; };
  }, []);
  if(!div || !state) return null;
  const s = div.states[state];
  if(!s){
    return (
      <div style={{margin:"4px 0 0"}}>
        <div className="aoi-sub">Multi-model agreement</div>
        <div className="note" style={{margin:"2px 0 4px"}}>
          Cross-engine ensemble available for {Object.keys(div.states).join(", ")}. This AOI's state is not yet in the inter-comparison.
        </div>
      </div>
    );
  }
  const meta = div.meta;
  const [lo, hi] = s.range, span = (hi - lo) || 1;
  const X = v => Math.max(0, Math.min(100, (v - lo) / span * 100));
  const byFam = {};
  Object.entries(s.engines).forEach(([eng, val]) => {
    const fam = meta.classes[eng] || "other";
    (byFam[fam] = byFam[fam] || []).push(val);
  });
  const fams = Object.entries(byFam).map(([fam, vals]) => ({
    fam, n: vals.length, mean: vals.reduce((a,b)=>a+b,0)/vals.length,
    lo: Math.min(...vals), hi: Math.max(...vals),
  })).sort((a,b) => b.mean - a.mean);
  const W = 280, H = 58, ml = 6, mr = 6, axY = 34;
  const px = pct => ml + pct/100 * (W - ml - mr);
  const fmtV = v => Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1);
  const agree = s.cv < 0.20 ? "strong agreement" : s.cv < 0.45 ? "moderate divergence" : "wide divergence";
  const agreeCol = s.cv < 0.20 ? "#3fb68b" : s.cv < 0.45 ? "#e6ab02" : "#d9534f";
  const metricName = meta.metric_label ? meta.metric_label.split("(")[0].trim() : "carbon";
  return (
    <div style={{margin:"4px 0 0"}}>
      <div className="aoi-sub">Multi-model agreement · {metricName}</div>
      <div className="note" style={{margin:"0 6px 2px"}}>
        {s.n_engines} models, {meta.bucket}, year {s.year_used}. Ensemble mean <b style={{color:"var(--ink)"}}>{fmtV(s.mean)}</b>,
        across-model range {fmtV(lo)} to {fmtV(hi)} (spread {Math.round(s.spread_pct)}% of the low estimate; CV {s.cv.toFixed(2)},
        <b style={{color:agreeCol}}> {agree}</b>).
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:330,display:"block",margin:"0 auto"}}>
        <line x1={px(0)} y1={axY} x2={px(100)} y2={axY} stroke="var(--line)" strokeWidth="2"/>
        <line x1={px(X(s.mean))} y1={axY-9} x2={px(X(s.mean))} y2={axY+9} stroke="#cdd6dd" strokeWidth="1.4"/>
        <text x={px(X(s.mean))} y={axY+20} fontSize="8" textAnchor="middle" fill="#9fb0ba">ens. mean</text>
        {fams.map((f) => {
          const col = FAMILY_COL[f.fam] || "#888";
          return (
            <g key={f.fam}>
              <line x1={px(X(f.lo))} y1={axY} x2={px(X(f.hi))} y2={axY} stroke={col} strokeWidth="1.2" opacity="0.5"/>
              <circle cx={px(X(f.mean))} cy={axY} r="4" fill={col} stroke="#0b1015" strokeWidth="0.5"/>
              <title>{`${FAMILY_LAB[f.fam]||f.fam}: mean ${fmtV(f.mean)} (n=${f.n}${f.n>1?`, ${fmtV(f.lo)} to ${fmtV(f.hi)}`:""})`}</title>
            </g>
          );
        })}
        <text x={px(0)} y={axY-13} fontSize="8" textAnchor="start" fill="#5e7180">{fmtV(lo)}</text>
        <text x={px(100)} y={axY-13} fontSize="8" textAnchor="end" fill="#5e7180">{fmtV(hi)}</text>
      </svg>
      <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:"2px 10px",margin:"1px 0 0"}}>
        {fams.map(f => (
          <span key={f.fam} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:9,color:"#5e7180"}}>
            <i style={{width:9,height:9,borderRadius:"50%",background:FAMILY_COL[f.fam]||"#888",display:"inline-block"}}/>
            {FAMILY_LAB[f.fam]||f.fam}{f.n>1?` (${f.n})`:""}
          </span>
        ))}
      </div>
      <div className="note" style={{margin:"3px 6px 2px"}}>
        Each dot is a model family's mean for this state; the colored bar is its within-family range. Wide spread across families means the projection carries high structural uncertainty for this area, so single-model numbers should be treated with caution. Source: api/engine_divergence.json.
      </div>
    </div>
  );
}

function downloadCsv(aoi){
  const rows = [["field","value"]];
  rows.push(["name", aoi.name||""]);
  if(aoi.area_m2) rows.push(["area_ac",(aoi.area_m2/4046.8564224).toFixed(0)],["area_ha",(aoi.area_m2/1e4).toFixed(0)]);
  if(aoi.centroid) rows.push(["centroid_lat",aoi.centroid[1].toFixed(4)],["centroid_lon",aoi.centroid[0].toFixed(4)]);
  rows.push(["ecoregion_l3",`${aoi.l3code||""} ${aoi.l3name||""}`.trim()],["biome_l1",aoi.l1||""]);
  const ps = aoi.plotStats;
  if(ps && ps.n>0){
    rows.push(["fia_plots",ps.n]);
    if(ps.meanAge!=null) rows.push(["mean_stand_age_yr",ps.meanAge.toFixed(0)]);
    if(ps.meanBA!=null) rows.push(["mean_live_ba_sqft_ac",ps.meanBA.toFixed(0)]);
    (ps.ownership||[]).forEach(o=>rows.push([`owner_${o.label}`,`${o.pct.toFixed(0)}%`]));
    (ps.forestTypes||[]).forEach(f=>rows.push([`fortype_${f.label}`,`${f.pct.toFixed(0)}%`]));
  }
  const c = aoi.curves && aoi.curves.untreated;
  if(c) c.forEach(([age,v])=>rows.push([`agb_tonac_age${age}_untreated`, v]));
  const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aoi_summary_${(aoi.l3code||"aoi").replace(/\./g,"_")}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

// Collapsible detail section: a consistent uppercase header with a chevron that
// tucks granular content away so the panel leads with the scorecard, radar, and
// outlook instead of overwhelming a landowner with every table at once.
function Collapsible({ title, subtitle, defaultOpen = false, children }){
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{margin:"4px 0 0"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:7,width:"100%",
        background:"transparent",border:"none",borderTop:"1px solid var(--line)",padding:"7px 4px 5px",
        cursor:"pointer",font:"inherit",textAlign:"left"}}>
        <span style={{fontSize:9,color:"#5e7180",transform:open?"rotate(90deg)":"none",
          transition:"transform .15s",display:"inline-block"}}>▶</span>
        <span style={{fontSize:11,fontWeight:600,letterSpacing:".03em",textTransform:"uppercase",color:"var(--mut)"}}>{title}</span>
        {subtitle && <span style={{fontSize:10.5,color:"#5e7180",fontWeight:400,marginLeft:"auto"}}>{subtitle}</span>}
      </button>
      {open && <div style={{padding:"2px 2px 0"}}>{children}</div>}
    </div>
  );
}

export default function AOIReport({ aoi, stumpage, onClose, units = "imperial" }){
  if(!aoi) return null;
  const cv = (v, u, d=0) => { const c = conv(v, u, units); return `${c.value.toFixed(d)} ${c.unit}`; };
  const price = (v, u) => { const c = conv(v, u, units); return `$${Math.round(c.value)}/${c.unit.replace("$/","")}`; };
  const { name, l3code, l3name, l1, centroid, nVerts, curves, area_m2, state, plotStats, landscape } = aoi;
  const unt = (curves && curves.untreated) || [];
  const har = (curves && curves.harvested) || [];
  const agb50 = valAt(unt, 50), agb50h = valAt(har, 50);
  const series = [
    { label: "untreated", color: "#3fb68b", pts: unt.map(([a,v]) => [a, null, v, null]) },
    { label: "harvested", color: "#e6ab02", pts: har.map(([a,v]) => [a, null, v, null]) },
  ].filter(s => s.pts.length);
  const Row = ({k,v}) => <div className="aoi-row"><span className="aoi-k">{k}</span><span className="aoi-v">{v}</span></div>;

  return (
    <div className="aoi-report">
      <div className="aoi-head">
        <b>AOI summary{name ? ` · ${name}` : ""}</b>
        <span>
          <button className="mini-btn" style={{marginTop:0,marginRight:6,borderStyle:"solid",fontWeight:600}}
            onClick={()=>openReport(aoi, stumpage, units)} title="open a full printable area report (save or print to PDF)">Report ↗</button>
          <button className="mini-btn" style={{marginTop:0,marginRight:6}}
            onClick={()=>downloadCsv(aoi)} title="download this summary as CSV">CSV ↓</button>
          {onClose && <button className="aoi-x" onClick={onClose} title="close">×</button>}
        </span>
      </div>

      {plainHeadline(aoi) && (
        <div style={{margin:"2px 6px 8px",padding:"7px 10px",borderRadius:6,
          background:"rgba(63,182,139,0.10)",border:"1px solid var(--line)",
          fontSize:13.5,lineHeight:1.35,color:"var(--ink)"}}>
          {plainHeadline(aoi)}
        </div>
      )}

      <div className="aoi-grid">
        {area_m2 ? <Row k="Area" v={fmtAreaU(area_m2, units)}/> : null}
        {centroid ? <Row k="Centroid" v={`${centroid[1].toFixed(3)}°, ${centroid[0].toFixed(3)}°`}/> : null}
        <Row k="Ecoregion" v={l3code ? `${l3code} ${l3name||""}` : "—"}/>
        {l1 ? <Row k="Biome (L1)" v={l1}/> : null}
        {agb50 != null ? <Row k="AGB @50yr" v={`${cv(agb50,"ton/ac")}${agb50h!=null?` (${conv(agb50h,"ton/ac",units).value.toFixed(0)} harvested)`:""}`}/> : null}
      </div>

      {plotStats && plotStats.n > 0 && (
       <Collapsible title="Forest attributes" subtitle={`${plotStats.n} FIA plots${plotStats.invYears?` · ${plotStats.invYears[0]}–${plotStats.invYears[1]}`:""}`}>
        <div className="aoi-grid">
          {plotStats.meanAge != null && <Row k="Mean stand age" v={`${plotStats.meanAge.toFixed(0)} yr`}/>}
          {plotStats.meanBA != null && <Row k="Mean live BA" v={cv(plotStats.meanBA,"sq ft/ac")}/>}
        </div>
        {plotStats.ownership && plotStats.ownership.length > 0 && (<>
          <div className="aoi-sub">Landowner composition</div>
          <div className="aoi-bars">
            {plotStats.ownership.map(o => (
              <div key={o.label} className="aoi-bar-row" title={`${o.n} plots`}>
                <span className="aoi-bar-lab">{o.label}</span>
                <span className="aoi-bar-track"><span className="aoi-bar-fill"
                  style={{width:`${o.pct}%`, background: OWN_COL[o.label] || "#888"}}/></span>
                <span className="aoi-bar-pct">{o.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </>)}
        {plotStats.forestTypes && plotStats.forestTypes.length > 0 && (<>
          <div className="aoi-sub">Forest-type composition</div>
          <div className="aoi-bars">
            {plotStats.forestTypes.map((f,i) => (
              <div key={f.label} className="aoi-bar-row" title={`${f.n} plots`}>
                <span className="aoi-bar-lab">{f.label}</span>
                <span className="aoi-bar-track"><span className="aoi-bar-fill"
                  style={{width:`${f.pct}%`, background: FT_PALETTE[i % FT_PALETTE.length]}}/></span>
                <span className="aoi-bar-pct">{f.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </>)}
       </Collapsible>
      )}
      {plotStats && plotStats.n === 0 && (
        <div className="note" style={{margin:"2px 0 6px"}}>No FIA plots fall inside this AOI{state?` in ${state}`:""}.</div>
      )}
      {!plotStats && (
        <div className="note" style={{margin:"2px 0 6px"}}>Plot-level attributes available for ME, GA, IN, MN, OR, WA AOIs.</div>
      )}

      {landscape && (landscape.ownership || landscape.risk || landscape.habitat || landscape.biodiversity || landscape.siteProductivity || landscape.speciesValue || landscape.stumpage || landscape.index) && (<>
        <div className="aoi-sub">Condition &amp; future outlook</div>
        {landscape.index && (
          <div>
            <Scorecard index={landscape.index}/>
            <ConditionRadar index={landscape.index} allCurves={aoi.allCurves}
              age0={aoi.plotStats && aoi.plotStats.meanAge}/>
            {radarNarrative(landscape.index) && (
              <div style={{margin:"2px 6px 4px",fontSize:12.5,color:"var(--ink)"}}>{radarNarrative(landscape.index)}</div>
            )}
            <div className="note" style={{margin:"0 0 4px",textAlign:"center"}}>
              Each axis = this area's percentile within its ecoregion (dashed ring = regional median). Use <b>Compare to</b> to overlay the surrounding area and state average, and <b>Outlook</b> to morph the radar to a reserve or managed future. Whiskers show the within-area spread. The future is a scenario direction from the ecoregion reserve/managed yield curves (carbon, resilience, timber value move; other axes held), not a re-ranked percentile. Resilience = low disturbance risk; biodiversity is a stand diversity index.
            </div>
            <PriorityDial index={landscape.index}/>
          </div>
        )}
        {landscape.rdSeries && <RDTrajectory series={landscape.rdSeries}/>}
        {landscape.structSeries && <StructureTrajectory series={landscape.structSeries}/>}
        <Collapsible title="Surrounding landscape" subtitle="sampled from CONUS layers">
        {landscape.forestFrac != null && (
          <div className="aoi-grid">
            <Row k="Forest cover (area)" v={`${Math.round(landscape.forestFrac*100)}%`}/>
          </div>
        )}
        {landscape.ownership && landscape.ownership.length > 0 && (<>
          <div className="aoi-sub" style={{borderTop:"none",marginTop:4}}>Landowner composition (forest ownership)</div>
          <div className="aoi-bars">
            {landscape.ownership.map(o => (
              <div key={o.label} className="aoi-bar-row" title={`${o.n} sampled cells`}>
                <span className="aoi-bar-lab">{o.label}</span>
                <span className="aoi-bar-track"><span className="aoi-bar-fill"
                  style={{width:`${o.pct}%`, background: OWN_COL[o.label] || "#888"}}/></span>
                <span className="aoi-bar-pct">{o.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </>)}
        <div className="aoi-bars" style={{marginTop:6}}>
          {landscape.risk && (
            <div className="aoi-bar-row" title={`mean P(disturbance) ${landscape.risk.mean.toFixed(2)}; ${landscape.risk.hi.toFixed(0)}% of area high-risk`}>
              <span className="aoi-bar-lab">Disturbance risk (2022)</span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${Math.min(100, landscape.risk.mean/0.72*100)}%`,
                        background: BAND_GOOD_LOW[landscape.risk.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_LOW[landscape.risk.band]}}>{landscape.risk.band}</span>
            </div>
          )}
          {landscape.habitat && (
            <div className="aoi-bar-row" title="Indicative composite of forest continuity, structural maturity, and disturbance">
              <span className="aoi-bar-lab">Habitat quality <i style={{opacity:.6,fontStyle:"normal"}}>~</i></span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.habitat.score*100}%`,
                        background: BAND_GOOD_HIGH[landscape.habitat.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.habitat.band]}}>{landscape.habitat.band}</span>
            </div>
          )}
          {landscape.biodiversity && (
            <div className="aoi-bar-row" title={`Forest-type evenness ${(landscape.diversity?landscape.diversity.evenness:0).toFixed(2)}; richness ${landscape.diversity?landscape.diversity.richness:0}`}>
              <span className="aoi-bar-lab">Biodiversity <i style={{opacity:.6,fontStyle:"normal"}}>~</i></span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.biodiversity.score*100}%`,
                        background: BAND_GOOD_HIGH[landscape.biodiversity.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.biodiversity.band]}}>{landscape.biodiversity.band}</span>
            </div>
          )}
          {landscape.siteProductivity && (
            <div className="aoi-bar-row" title="Relative position on the Climate Site Productivity Index (CSPI) within this area">
              <span className="aoi-bar-lab">Site productivity (CSPI)</span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.siteProductivity.rel*100}%`,
                        background: BAND_GOOD_HIGH[landscape.siteProductivity.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.siteProductivity.band]}}>{landscape.siteProductivity.band}</span>
            </div>
          )}
          {landscape.speciesValue && (
            <div className="aoi-bar-row" title="Relative commercial species value (SVI, regional mean = 1) within this area">
              <span className="aoi-bar-lab">Species value (SVI)</span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.speciesValue.rel*100}%`,
                        background: BAND_GOOD_HIGH[landscape.speciesValue.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.speciesValue.band]}}>{landscape.speciesValue.band}</span>
            </div>
          )}
          {landscape.relDensity && (
            <div className="aoi-bar-row" title="Relative stand density / stocking (TreeMap relative density) within this area">
              <span className="aoi-bar-lab">Relative density (stocking)</span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.relDensity.rel*100}%`, background:"#42b540"}}/></span>
              <span className="aoi-bar-pct">{landscape.relDensity.band}</span>
            </div>
          )}
          {landscape.sawtimberShare && (
            <div className="aoi-bar-row" title="Sawtimber share of biomass (larger, higher-value size classes) within this area">
              <span className="aoi-bar-lab">Sawtimber share</span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.sawtimberShare.rel*100}%`,
                        background: BAND_GOOD_HIGH[landscape.sawtimberShare.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.sawtimberShare.band]}}>{landscape.sawtimberShare.band}</span>
            </div>
          )}
        </div>
        {landscape.stumpage && (<>
          <div className="aoi-sub" style={{borderTop:"none",marginTop:6}}>Stumpage prices{state?` · ${state}`:""}</div>
          <div className="aoi-grid">
            {landscape.stumpage.sawSW!=null && <Row k="Sawlog · softwood" v={price(landscape.stumpage.sawSW,"$/MBF")}/>}
            {landscape.stumpage.sawHW!=null && <Row k="Sawlog · hardwood" v={price(landscape.stumpage.sawHW,"$/MBF")}/>}
            {landscape.stumpage.pulpSW!=null && <Row k="Pulpwood · softwood" v={price(landscape.stumpage.pulpSW,"$/cord")}/>}
            {landscape.stumpage.pulpHW!=null && <Row k="Pulpwood · hardwood" v={price(landscape.stumpage.pulpHW,"$/cord")}/>}
          </div>
        </>)}
        <div className="note" style={{margin:"4px 0 2px"}}>
          Landowner, forest cover, and disturbance risk are sampled from the CONUS rasters inside this area.
          Habitat and biodiversity (<i>~</i>) are indicative composites of forest continuity, structural maturity,
          and forest-type diversity — refine with field inventory.
        </div>
        </Collapsible>
      </>)}

      <ModelAgreement state={state}/>
      <StandOutlook aoi={aoi} stumpage={stumpage} units={units}/>
      <div className="note" style={{marginTop:6}}>
        Sources: FIA plots (attributes, ownership), yield_curves_by_l3 (projection),
        us_eco_l3_features (ecoregion). Area is geodesic (Albers equal-area).
      </div>
    </div>
  );
}
