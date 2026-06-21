// Build a run: the GUI-driven on-demand flow for non-technical users. Select an area,
// choose models, build scenarios, press a button. Free tier resolves the real
// multi-model ensemble from precomputed PERSEUS series client-side; the subscriber
// path animates a Cardinal HPC submission of the same run-spec. Economics and a
// plain-language recommendation come from the per-L3 yield curves.
import { useState, useEffect } from "react";

const STATES = ["AK","AL","AR","AZ","CA","CO","CT","DE","FL","GA","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY"];
const MODELS = [["fvs","FVS","FVS"],["cbm","CBM","CBM"],["cem","CEM","CEM"],["yield","Yield curves","YC"],["landis","LANDIS","LANDIS"]];
const CLS_COL = { FVS:"#3a6ea5", CBM:"#8a5cd1", CEM:"#d98a3c", YC:"#2e9e6b", LANDIS:"#c0504d" };
const MGMTS = [["reserve","Reserve (no harvest)","reserve (no harvest)","untreated"],
               ["baseline","Managed (harvest)","managed (harvest)","harvested"],
               ["intensive","Managed (intensive)","managed (intensive)","harvested"],
               ["conservation","Managed (conservation)","managed (conservation)","harvested"],
               ["extensive","Managed (extensive)","managed (extensive)","harvested"]];
const CLIMATES = [["historic","Historic"],["baseline_2020","2020 baseline"],["rcp45","RCP4.5"],["rcp85","RCP8.5"]];
const METRICS = [["agc_live_total","Carbon, live (t/ac)"],["merch_vol_mcf","Merch. volume (MCF)"],
                 ["standing_value_musd","Standing value ($M)"],["es_bundle_score","Ecosystem-service score"],
                 ["mean_stand_age","Mean stand age (yr)"],["total_ecosystem_c","Total ecosystem C"]];
const PRICE_PATHS = { low:{saw:0.20,pulp:0.03,carbon:8,label:"Low"}, base:{saw:0.35,pulp:0.05,carbon:15,label:"Base"}, high:{saw:0.55,pulp:0.09,carbon:30,label:"High"} };
const ES_LEVELS = [["none","None",0],["mod","$5/ac/yr",5],["high","$15/ac/yr",15]];
const SAW_FRACTION = 0.55, DISCOUNT = 0.04, ES_MANAGED_FRAC = 0.5;
const annuity = (age,r)=>(1-Math.pow(1+r,-age))/r;
const fmt = (v,d=0)=>(v==null||isNaN(v)?"–":Number(v).toLocaleString(undefined,{maximumFractionDigits:d}));
// Policy as a scenario driver
// Future policy scenarios. Forestry, unlike ag, trends toward restricting management.
const POLICIES = [
  ["none","No policy constraint"],
  ["cert","Certification (+10% timber)"],
  ["setaside","Riparian set-aside (15% no-harvest)"],
  ["lsog","Late-successional / old-growth protection"],
  ["carbon_market","Compliance carbon market"],
  ["proforestation","Proforestation (let it grow)"],
  ["public_pressure","Public harvest restrictions"],
  ["reserve_mandate","Reserve mandate (no harvest)"],
];
// effect on timber (t) and carbon (c) value
const POLICY_FX = {
  none:{t:1,c:1}, cert:{t:1.10,c:1}, setaside:{t:0.85,c:1.05},
  lsog:{t:0.65,c:1.25}, carbon_market:{t:1,c:2.0}, proforestation:{t:0,c:1.30},
  public_pressure:{t:0.55,c:1.10}, reserve_mandate:{t:0,c:1},
};
const polT = (policy)=>(POLICY_FX[policy]||POLICY_FX.none).t;
const polC = (policy)=>(POLICY_FX[policy]||POLICY_FX.none).c;
// Multi-criteria framework (precision-forestry MCDA): emphasis presets weight normalized criteria
const RESIL_FACTOR = { reserve:1.10, conservation:1.05, extensive:1.0, baseline:0.95, intensive:0.90 };
const EMPH = { balanced:{e:1,c:1,r:1,a:1}, income:{e:2,c:0.5,r:0.5,a:1}, carbon:{e:0.5,c:2,r:1,a:1}, resilience:{e:0.5,c:1,r:2,a:1} };
const EMPH_LABELS = [["balanced","Balanced"],["income","Income"],["carbon","Carbon"],["resilience","Resilience"]];
const norm = (v, lo, hi) => (hi>lo ? (v-lo)/(hi-lo) : 0.5);

function econFromL3(node, curveKey, p) {
  const cm = (node && node.curves) || {};
  const merch = cm.merchvol_cuftac && cm.merchvol_cuftac[curveKey];
  const carb = cm.carbon_lbac && cm.carbon_lbac[curveKey];
  const blend = SAW_FRACTION*p.saw + (1-SAW_FRACTION)*p.pulp;
  const o = {};
  if (merch && merch.length) { const [a,v]=merch[merch.length-1]; o.age=a; o.npvH=(v*blend)/Math.pow(1+DISCOUNT,a); }
  if (carb && carb.length) { const [a,lb]=carb[carb.length-1]; o.age=o.age||a; o.npvC=((lb/2204.62)*(44/12)*p.carbon)/Math.pow(1+DISCOUNT,a); }
  return o;
}

function MultiLineChart({ rows }) {
  if (!rows.length) return <div className="note">No model output for this scenario.</div>;
  const W=360,H=170,m={l:42,r:10,t:10,b:22};
  const xs=rows.flatMap(r=>r.pts.map(p=>p[0])), ys=rows.flatMap(r=>r.pts.map(p=>p[1]));
  const x0=Math.min(...xs),x1=Math.max(...xs),y1=Math.max(...ys,1)*1.05,y0=Math.min(...ys,0);
  const px=v=>m.l+(v-x0)/((x1-x0)||1)*(W-m.l-m.r), py=v=>(H-m.b)-(v-y0)/((y1-y0)||1)*(H-m.t-m.b);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{fontSize:9,fontVariantNumeric:"tabular-nums"}}>
      <line x1={m.l} y1={H-m.b} x2={W-m.r} y2={H-m.b} stroke="var(--line,#345)" strokeWidth={0.6}/>
      <line x1={m.l} y1={m.t} x2={m.l} y2={H-m.b} stroke="var(--line,#345)" strokeWidth={0.6}/>
      {[y0,(y0+y1)/2,y1].map((t,i)=><text key={i} x={m.l-4} y={py(t)+3} textAnchor="end" fill="var(--mut,#8a93a0)">{fmt(t)}</text>)}
      {[x0,Math.round((x0+x1)/2),x1].map((t,i)=><text key={i} x={px(t)} y={H-m.b+13} textAnchor="middle" fill="var(--mut,#8a93a0)">{t}</text>)}
      {rows.map((r,i)=><polyline key={i} points={r.pts.map(p=>`${px(p[0])},${py(p[1])}`).join(" ")} fill="none" stroke={CLS_COL[r.cls]||"#888"} strokeWidth={1.5} opacity={0.85}/>)}
    </svg>
  );
}

export default function RunBuilder() {
  const [st, setSt] = useState("ME");
  const [models, setModels] = useState({ fvs:true, cbm:true, cem:true, yield:true, landis:false });
  const [metric, setMetric] = useState("agc_live_total");
  const [scenarios, setScenarios] = useState([{ mgmt:"reserve", climate:"historic" }, { mgmt:"baseline", climate:"historic" }]);
  const [price, setPrice] = useState("base");
  const [es, setEs] = useState("none");
  const [policy, setPolicy] = useState("none");
  const [emphasis, setEmphasis] = useState("balanced");
  const [series, setSeries] = useState(null);
  const [yields, setYields] = useState(null);
  const [hrr, setHrr] = useState(null);
  const [run, setRun] = useState(null);
  const [hpc, setHpc] = useState("idle"); // idle|submitting|queued|running|complete
  const base = import.meta.env.BASE_URL || "/";

  useEffect(() => { fetch(`${base}api/yield_curves_by_l3.json`).then(r=>r.json()).then(setYields).catch(()=>{}); }, []);
  useEffect(() => { fetch(`${base}api/hrr_states.json`).then(r=>r.json()).then(setHrr).catch(()=>{}); }, []);
  useEffect(() => {
    setSeries(null); setRun(null); setHpc("idle");
    fetch(`${base}api/series/${st}.json`).then(r=>r.ok?r.json():null).then(setSeries).catch(()=>setSeries(null));
  }, [st]);

  // available metrics/managements for this state (never offer an empty selection)
  const availMetrics = series ? METRICS.filter(([k]) => series[k] && Object.values(series[k]).some(a=>a&&a.length)) : METRICS;
  useEffect(() => { if (series && !availMetrics.some(([k])=>k===metric) && availMetrics[0]) setMetric(availMetrics[0][0]); }, [series]);
  const availMgmts = (series && series[metric]) ? MGMTS.filter(([,,lab]) => series[metric][lab] && series[metric][lab].length) : MGMTS;

  // representative ecoregion for economics (per-acre yield curves covering this state)
  const repNode = (() => {
    if (!yields || !yields.l3) return null;
    let best=null, bestN=-1;
    for (const c of Object.keys(yields.l3)) { const n=yields.l3[c]; if (n.states && n.states.includes(st) && (n.n_fits||0)>bestN) { best=n; bestN=n.n_fits||0; } }
    return best;
  })();

  const selModels = MODELS.filter(([k]) => models[k]);
  const p = PRICE_PATHS[price];
  const esAnnual = (ES_LEVELS.find(([k])=>k===es)||[])[2] || 0;
  const stateResil = hrr && hrr[st] ? hrr[st].resil_mean : null;
  const stateStress = hrr && hrr[st] ? hrr[st].stress_mean : null;
  const spec = {
    spec_version:"1.0", aoi:{type:"inventory",state:st,scale:"ownership"},
    models:selModels.map(([k])=>k),
    assumptions:{ management:[...new Set(scenarios.map(s=>s.mgmt))], climate:[...new Set(scenarios.map(s=>s.climate))], horizon_year:2100, policy },
    markets:{ price_scenario:price, carbon_usd_per_tco2e:p.carbon, es_usd_per_ac_yr:esAnnual, discount_rate:DISCOUNT },
    outputs:[metric], tier:"subscriber",
  };

  function resolve() {
    if (!series) { setRun({ status:"no_data" }); return; }
    const node = series[metric] || {};
    const results = scenarios.map((sc) => {
      const mg = MGMTS.find(([k])=>k===sc.mgmt) || [];
      const entries = node[mg[2]] || [];
      const engines = selModels.map(([mk,,cls]) => {
        let ms = entries.filter(e=>e.cls===cls);
        if (sc.climate!=="historic") { const cf=ms.filter(e=>(e.model||"").toLowerCase().includes(sc.climate)); if (cf.length) ms=cf; }
        return { mk, cls, rows: ms.map(e=>({model:e.model,cls:e.cls,pts:e.pts.map(pt=>[pt[0],pt[1]])})) };
      });
      const e = econFromL3(repNode, mg[3], p);
      const npvH = (e.npvH||0)*polT(policy);
      const npvC = (e.npvC||0)*polC(policy);
      const esv = (sc.mgmt==="reserve"?1:ES_MANAGED_FRAC) * (esAnnual ? esAnnual*annuity(e.age||100,DISCOUNT) : 0);
      const primary = sc.mgmt==="reserve" ? npvC : npvH;
      const total = primary + esv;
      // multi-criteria: forest-condition outcome (ensemble endpoint mean) + agreement + resilience
      const ends = engines.flatMap(en=>en.rows).map(r=>r.pts[r.pts.length-1][1]);
      const mean = ends.length ? ends.reduce((a,b)=>a+b,0)/ends.length : null;
      const sd = ends.length>1 ? Math.sqrt(ends.reduce((a,b)=>a+(b-mean)**2,0)/ends.length) : 0;
      const agree = mean ? Math.max(0, 1-(sd/Math.abs(mean))) : null;
      const resil = stateResil!=null ? Math.min(1, stateResil*(RESIL_FACTOR[sc.mgmt]||1)) : null;
      return { sc, engines, econ:{...e, npvH, npvC, esv, total},
               criteria:{ econ:total, carbon:npvC, es:esv, resil, agree, outcome:mean } };
    });
    setRun({ status:"complete", results });
  }

  // recommendation (reserve vs managed) for this area + market + ES
  const eRes = econFromL3(repNode,"untreated",p), eBas = econFromL3(repNode,"harvested",p);
  const esAge = eRes.age||eBas.age||100;
  const esFull = esAnnual?esAnnual*annuity(esAge,DISCOUNT):0, esMan = esFull*ES_MANAGED_FRAC;
  const reserveTotal=(eRes.npvC||0)*polC(policy)+esFull, managedTotal=(eBas.npvH||0)*polT(policy)+esMan;
  const carbonLean = reserveTotal>managedTotal;
  const polClause = policy!=="none" ? ` under ${(POLICIES.find(([k])=>k===policy)||[])[1].toLowerCase()}` : "";
  const decision = repNode ? (carbonLean
    ? `At ${p.label.toLowerCase()} prices${esAnnual?" with ES payments":""}${polClause}, this forest is worth more standing (~$${fmt(reserveTotal)}/ac NPV) than harvested (~$${fmt(managedTotal)}/ac). A reserve or light-touch strategy looks favorable.`
    : `At ${p.label.toLowerCase()} prices${esAnnual?" even with ES payments":""}${polClause}, active management pays (~$${fmt(managedTotal)}/ac NPV) over keeping it standing (~$${fmt(reserveTotal)}/ac). A managed strategy looks favorable.`) : null;

  function submitHPC() {
    setRun(null); setHpc("submitting");
    setTimeout(()=>setHpc("queued"), 700);
    setTimeout(()=>setHpc("running"), 1900);
    setTimeout(()=>{ setHpc("complete"); resolve(); }, 3800);
  }
  function runFree() { setHpc("idle"); resolve(); }

  const setScn=(i,k,v)=>setScenarios(s=>s.map((r,j)=>j===i?{...r,[k]:v}:r));
  const addScn=()=>setScenarios(s=>[...s,{mgmt:(availMgmts[0]||MGMTS[0])[0],climate:"rcp45"}]);
  const rmScn=(i)=>setScenarios(s=>s.length>1?s.filter((_,j)=>j!==i):s);
  const sel={background:"var(--panel)",color:"var(--ink)",border:"1px solid var(--line)",borderRadius:5,padding:"2px 6px",fontSize:11};
  const chip=(on,col)=>({fontSize:11,padding:"2px 9px",borderRadius:4,cursor:"pointer",border:`1px solid ${on?(col||"#3a6ea5"):"var(--bd,#345)"}`,background:on?(col||"#3a6ea5"):"transparent",color:on?"#fff":"var(--fg,#cdd)"});
  const HPC_STEP={submitting:["Submitting run-spec to Cardinal…",15],queued:["Queued on SLURM (PUOM0008)…",40],running:["Running ensemble: FVS, CBM, CEM, yield…",75],complete:["Complete — results delivered",100]};

  return (
    <div>
      <div className="who" style={{marginBottom:6}}><b>Build a run</b> <span style={{color:"var(--mut)"}}>· select an area, choose models, build scenarios, submit</span></div>

      {/* 1. area */}
      <div className="chartcard" style={{padding:"8px 10px",marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--mut)",marginBottom:4}}>1 · Area of interest</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",fontSize:11}}>
          <span style={{color:"var(--mut)"}}>State (ownership):</span>
          <select value={st} onChange={e=>setSt(e.target.value)} style={sel}>{STATES.map(s=><option key={s} value={s}>{s}</option>)}</select>
          <span style={{color:"var(--mut)"}}>{series===null?"loading area data…":`${availMetrics.length} metrics available`}</span>
        </div>
        <div className="note" style={{marginTop:4}}>States are the precomputed unit here. A subscriber run takes a drawn AOI or uploaded inventory at any scale, crossing state lines, and resolves the same way.</div>
      </div>

      {/* 2. models */}
      <div className="chartcard" style={{padding:"8px 10px",marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--mut)",marginBottom:4}}>2 · Models &amp; output</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {MODELS.map(([k,lbl,cls])=><span key={k} style={chip(models[k],CLS_COL[cls])} onClick={()=>setModels(m=>({...m,[k]:!m[k]}))}>{lbl}</span>)}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,marginTop:6}}>
          <span style={{color:"var(--mut)"}}>Output metric:</span>
          <select value={metric} onChange={e=>setMetric(e.target.value)} style={sel}>{availMetrics.map(([k,lbl])=><option key={k} value={k}>{lbl}</option>)}</select>
        </div>
      </div>

      {/* 3. scenarios */}
      <div className="chartcard" style={{padding:"8px 10px",marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--mut)",marginBottom:4}}>3 · Scenarios (management × climate)</div>
        {scenarios.map((sc,i)=>(
          <div key={i} style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,marginBottom:4}}>
            <span style={{color:"var(--mut)",width:14}}>{i+1}</span>
            <select value={sc.mgmt} onChange={e=>setScn(i,"mgmt",e.target.value)} style={sel}>{(availMgmts.length?availMgmts:MGMTS).map(([k,lbl])=><option key={k} value={k}>{lbl}</option>)}</select>
            <select value={sc.climate} onChange={e=>setScn(i,"climate",e.target.value)} style={sel}>{CLIMATES.map(([k,lbl])=><option key={k} value={k}>{lbl}</option>)}</select>
            {scenarios.length>1 && <span onClick={()=>rmScn(i)} style={{cursor:"pointer",color:"var(--mut)",fontWeight:700}}>×</span>}
          </div>
        ))}
        <span onClick={addScn} style={{...chip(false),display:"inline-block",marginTop:2}}>+ add scenario</span>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,marginTop:8}}>
          <span style={{color:"var(--mut)"}}>Market:</span>
          {Object.entries(PRICE_PATHS).map(([k,v])=><span key={k} style={chip(price===k)} onClick={()=>setPrice(k)}>{v.label}</span>)}
          <span style={{color:"var(--mut)",marginLeft:6}}>ES:</span>
          {ES_LEVELS.map(([k,lbl])=><span key={k} style={chip(es===k)} onClick={()=>setEs(k)}>{lbl}</span>)}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,marginTop:6}}>
          <span style={{color:"var(--mut)"}}>Policy:</span>
          <select value={policy} onChange={e=>setPolicy(e.target.value)} style={sel}>{POLICIES.map(([k,lbl])=><option key={k} value={k}>{lbl}</option>)}</select>
        </div>
        <div className="note" style={{marginTop:4}}>Unlike agriculture, forest policy and public sentiment tend to restrict harvesting. These futures, from certification to old-growth protection, compliance carbon, and proforestation, let you test how restrictions reshape value, carbon, and the recommended strategy.</div>
      </div>

      {/* 4. submit */}
      <div className="chartcard" style={{padding:"8px 10px",marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--mut)",marginBottom:4}}>4 · Submit</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={runFree} disabled={!selModels.length||series===null} className="mini-btn" style={{borderStyle:"solid",fontSize:12,padding:"4px 12px"}}>Run free (precomputed)</button>
          <button onClick={submitHPC} disabled={!selModels.length||series===null||hpc==="submitting"||hpc==="queued"||hpc==="running"} className="mini-btn" style={{borderStyle:"solid",fontSize:12,padding:"4px 12px",borderColor:"#8a5cd1",color:hpc==="idle"||hpc==="complete"?"var(--ink)":"#8a5cd1"}}>⚡ Submit custom run to Cardinal (subscriber)</button>
        </div>
        {hpc!=="idle" && (
          <div style={{marginTop:8}}>
            <div style={{fontSize:11,marginBottom:3}}>{HPC_STEP[hpc][0]}</div>
            <div style={{height:6,background:"var(--panel)",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:HPC_STEP[hpc][1]+"%",background:"#8a5cd1",transition:"width 0.6s"}}/>
            </div>
          </div>
        )}
        <details style={{marginTop:6}}>
          <summary style={{fontSize:11,color:"var(--mut)",cursor:"pointer"}}>view run-spec (the Cardinal contract)</summary>
          <pre style={{fontSize:10,overflow:"auto",background:"var(--panel)",padding:8,borderRadius:5,marginTop:4}}>{JSON.stringify(spec,null,2)}</pre>
        </details>
      </div>

      {/* results */}
      {run && run.status==="no_data" && <div className="note" style={{padding:8}}>No precomputed series for {st}. A subscriber run would compute this live on Cardinal.</div>}
      {run && run.results && decision && (
        <div className="chartcard" style={{padding:"8px 10px",marginBottom:8,borderLeft:"3px solid "+(carbonLean?"#2e9e6b":"#d98a3c")}}>
          <div style={{fontSize:11,fontWeight:600,marginBottom:2}}>Recommendation {hpc==="complete"?"· delivered from Cardinal":"· free precomputed"}</div>
          <div style={{fontSize:12}}>{decision}</div>
        </div>
      )}
      {run && run.results && run.results.map((r,i)=>{
        const allRows=r.engines.flatMap(e=>e.rows), present=r.engines.filter(e=>e.rows.length);
        return (
          <div key={i} className="chartcard" style={{padding:"8px 10px",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:600,marginBottom:2}}>Scenario {i+1}: {(MGMTS.find(([k])=>k===r.sc.mgmt)||[])[1]} · {(CLIMATES.find(([k])=>k===r.sc.climate)||[])[1]}</div>
            <div style={{fontSize:10,color:"var(--mut)",marginBottom:2}}>{(METRICS.find(([k])=>k===metric)||[])[1]} · {allRows.length} model runs across {present.length} engines</div>
            <MultiLineChart rows={allRows}/>
            <div style={{display:"flex",flexWrap:"wrap",gap:10,fontSize:10,marginTop:2}}>{present.map(e=><span key={e.cls} style={{color:CLS_COL[e.cls]}}>● {e.cls} ({e.rows.length})</span>)}</div>
            {repNode && (r.econ.npvH!=null||r.econ.npvC!=null) && (
              <div className="note" style={{marginTop:4}}>Economics (NPV/ac, {p.label} market{esAnnual?`, ES $${esAnnual}/ac/yr`:""}): timber ${fmt(r.econ.npvH)} · carbon ${fmt(r.econ.npvC)} · eco-services ${fmt(r.econ.esv)} · <b>total ${fmt(r.econ.total)}</b></div>
            )}
          </div>
        );
      })}
      {run && run.results && run.results.length>0 && (() => {
        const rs = run.results;
        const vals = (key) => rs.map(r=>r.criteria[key]).filter(v=>v!=null);
        const rng = (key) => { const v=vals(key); return v.length?[Math.min(...v),Math.max(...v)]:[0,1]; };
        const [eLo,eHi]=rng("econ"),[cLo,cHi]=rng("carbon"),[rLo,rHi]=rng("resil"),[aLo,aHi]=rng("agree");
        const w = EMPH[emphasis];
        const scored = rs.map(r=>{ const c=r.criteria;
          const ne=norm(c.econ,eLo,eHi), nc=norm(c.carbon,cLo,cHi), nr=c.resil!=null?norm(c.resil,rLo,rHi):0.5, na=c.agree!=null?norm(c.agree,aLo,aHi):0.5;
          return { r, score:100*(w.e*ne+w.c*nc+w.r*nr+w.a*na)/(w.e+w.c+w.r+w.a) }; });
        const best = Math.max(...scored.map(s=>s.score));
        return (
          <div className="chartcard" style={{padding:"8px 10px",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:600,marginBottom:1}}>Multi-criteria scorecard <span style={{color:"var(--mut)",fontWeight:400}}>· precision-forestry decision framework</span></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,margin:"4px 0"}}>
              <span style={{color:"var(--mut)"}}>Emphasis:</span>
              {EMPH_LABELS.map(([k,lbl])=><span key={k} style={chip(emphasis===k)} onClick={()=>setEmphasis(k)}>{lbl}</span>)}
            </div>
            <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",fontVariantNumeric:"tabular-nums"}}>
              <thead><tr style={{color:"var(--mut)",textAlign:"right"}}>
                <th style={{textAlign:"left",fontWeight:500}}>Scenario</th>
                <th style={{fontWeight:500}}>Total $/ac</th><th style={{fontWeight:500}}>Carbon $</th><th style={{fontWeight:500}}>Eco-svc $</th>
                <th style={{fontWeight:500}}>Resilience</th><th style={{fontWeight:500}}>Agreement</th><th style={{fontWeight:500}}>Score</th>
              </tr></thead>
              <tbody>
                {scored.map(({r,score},i)=>{ const c=r.criteria; const isBest=score>=best-0.001;
                  return (
                    <tr key={i} style={{textAlign:"right",borderTop:"1px solid var(--line,#345)",background:isBest?"rgba(46,158,107,0.12)":"transparent"}}>
                      <td style={{textAlign:"left"}}>{(MGMTS.find(([k])=>k===r.sc.mgmt)||[])[1]} · {(CLIMATES.find(([k])=>k===r.sc.climate)||[])[1]}</td>
                      <td>${fmt(c.econ)}</td><td>${fmt(c.carbon)}</td><td>${fmt(c.es)}</td>
                      <td>{c.resil!=null?Math.round(c.resil*100):"–"}</td><td>{c.agree!=null?Math.round(c.agree*100)+"%":"–"}</td>
                      <td style={{fontWeight:700,color:isBest?"#2e9e6b":"var(--ink)"}}>{Math.round(score)}{isBest?" ★":""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="note" style={{marginTop:4}}>Each scenario scored 0–100 across economic value, carbon, ecosystem services, resilience, and cross-model agreement, weighted by your emphasis. Resilience is the state HRR baseline with an illustrative management adjustment. This is the multi-criteria, multi-model basis that sets PERSEUS apart from single-objective tools.</div>
          </div>
        );
      })()}
      {run && run.results && <div className="note" style={{color:"var(--mut)"}}>Each line is one model run; spread between engines is the honest uncertainty. Economics from per-acre yield curves for the representative ecoregion. This is the ensemble and valuation a subscriber gets on demand for their exact area.</div>}
    </div>
  );
}
