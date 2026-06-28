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
// Price scenarios apply a low/base/high band to the REAL per-state stumpage (timber side)
// and an illustrative carbon price. `mult` scales the real stumpage; carbon stays illustrative.
// Carbon prices anchored to real payment benchmarks (mid-2026): voluntary forest market
// (~$15/tCO2e, improved forest management), California compliance allowance (~$35), and the
// CA compliance price ceiling (~$95). The EPA social cost of carbon (~$190) is a societal
// value, not a landowner payment, so it is cited in the note rather than used as a price.
const PRICE_PATHS = { low:{mult:0.7,carbon:15,label:"Low"}, base:{mult:1.0,carbon:35,label:"Base"}, high:{mult:1.4,carbon:95,label:"High"} };
const ES_LEVELS = [["none","None",0],["mod","$5/ac/yr",5],["high","$15/ac/yr",15]];
const ES_MANAGED_FRAC = 0.5;
const M3_PER_CUFT = 1/35.3147;            // yield-curve merch volume is cu ft/ac; stumpage is $/m3
const DISC_RATES = [["0.03","3%"],["0.04","4%"],["0.05","5%"],["0.07","7%"]];
const NATIONAL_STUMPAGE_M3 = 25.55;       // fallback for states without a measured blended price
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
// Disturbance/climate risk: active management can lower competition- and fuel-driven risk (illustrative)
const RISK_FACTOR = { reserve:1.05, conservation:1.0, extensive:1.0, baseline:0.92, intensive:0.85 };
const EMPH = { balanced:{e:1,c:1,r:1,a:1,k:1}, income:{e:2,c:0.5,r:0.5,a:1,k:0.5}, carbon:{e:0.5,c:2,r:1,a:1,k:1}, resilience:{e:0.5,c:1,r:2,a:1,k:1.5} };
const EMPH_LABELS = [["balanced","Balanced"],["income","Income"],["carbon","Carbon"],["resilience","Resilience & risk"]];
const norm = (v, lo, hi) => (hi>lo ? (v-lo)/(hi-lo) : 0.5);
function computeScores(rs, emphasis){
  const vals=(key)=>rs.map(r=>r.criteria[key]).filter(v=>v!=null);
  const rng=(key)=>{const v=vals(key);return v.length?[Math.min(...v),Math.max(...v)]:[0,1];};
  const [eLo,eHi]=rng("econ"),[cLo,cHi]=rng("carbon"),[rLo,rHi]=rng("resil"),[aLo,aHi]=rng("agree"),[kLo,kHi]=rng("risk");
  const w=EMPH[emphasis]||EMPH.balanced;
  const scored=rs.map(r=>{const c=r.criteria;
    const ne=norm(c.econ,eLo,eHi),nc=norm(c.carbon,cLo,cHi),nr=c.resil!=null?norm(c.resil,rLo,rHi):0.5,na=c.agree!=null?norm(c.agree,aLo,aHi):0.5;
    const nk=c.risk!=null?(1-norm(c.risk,kLo,kHi)):0.5; // lower risk is better
    return {r,score:100*(w.e*ne+w.c*nc+w.r*nr+w.a*na+w.k*nk)/(w.e+w.c+w.r+w.a+w.k)};});
  const best=scored.length?Math.max(...scored.map(s=>s.score)):0;
  return {scored,best};
}

// Faustmann rotation economics. Instead of discounting the standing volume at the curve's
// final age (which collapses to ~0 at high discount rates), find the optimal rotation age R*
// that maximizes the single-rotation NPV of the harvest, and also report the perpetual
// soil/land expectation value (LEV). Gross of establishment and management costs.
function rotationTimber(merch, stumpageCuft, disc, estCost = 0, mgmtCost = 0) {
  if (!merch || merch.length < 2) return null;
  const vol = (a) => {
    if (a <= merch[0][0]) return merch[0][1] * a / Math.max(merch[0][0], 1);
    for (let i = 1; i < merch.length; i++) {
      if (a <= merch[i][0]) { const [x0,y0]=merch[i-1], [x1,y1]=merch[i]; return y0 + (y1-y0)*(a-x0)/((x1-x0)||1); }
    }
    return merch[merch.length - 1][1];
  };
  // Net single-rotation NPV: harvest revenue at R, less establishment cost (age 0) and the
  // present value of annual management cost over the rotation. estCost/mgmtCost default 0 (gross).
  const ann = (R) => disc > 0 ? (1 - Math.pow(1+disc, -R)) / disc : R;
  const srNPV = (R) => vol(R)*stumpageCuft*Math.pow(1+disc, -R) - estCost - mgmtCost*ann(R);
  let bestNPV = -Infinity, R = 10;
  for (let a = 10; a <= 120; a++) { const v = srNPV(a); if (v > bestNPV) { bestNPV = v; R = a; } }
  const lev = bestNPV / (1 - Math.pow(1+disc, -R));   // perpetual land value (identical rotations)
  return { npv: bestNPV, rotation: R, lev };
}

// stumpageCuft = effective $/cu ft (real per-state $/m3 x price-scenario mult, converted).
// Timber value is the optimal single-rotation NPV (rotation R*); carbon value is the carbon
// trajectory discounted at the horizon. LEV (perpetual land value) is carried for display.
function econFromL3(node, curveKey, stumpageCuft, carbonPrice, disc, estCost = 0, mgmtCost = 0) {
  const cm = (node && node.curves) || {};
  const merch = cm.merchvol_cuftac && cm.merchvol_cuftac[curveKey];
  const carb = cm.carbon_lbac && cm.carbon_lbac[curveKey];
  const o = {};
  const ft = rotationTimber(merch, stumpageCuft, disc, estCost, mgmtCost);
  if (ft) { o.npvH = ft.npv; o.rotation = ft.rotation; o.lev = ft.lev; }
  if (carb && carb.length) { const [a,lb]=carb[carb.length-1]; o.age=a; o.npvC=((lb/2204.62)*(44/12)*carbonPrice)/Math.pow(1+disc,a); }
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

// Build an inline SVG of the ensemble trajectories for embedding in the report.
function svgFor(rows){
  if(!rows.length) return "";
  const W=560,H=200,m={l:46,r:12,t:10,b:24};
  const xs=rows.flatMap(r=>r.pts.map(p=>p[0])), ys=rows.flatMap(r=>r.pts.map(p=>p[1]));
  const x0=Math.min(...xs),x1=Math.max(...xs),y1=Math.max(...ys,1)*1.05,y0=Math.min(...ys,0);
  const px=v=>m.l+(v-x0)/((x1-x0)||1)*(W-m.l-m.r), py=v=>(H-m.b)-(v-y0)/((y1-y0)||1)*(H-m.t-m.b);
  const ax=`<line x1="${m.l}" y1="${H-m.b}" x2="${W-m.r}" y2="${H-m.b}" stroke="#ccc"/><line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H-m.b}" stroke="#ccc"/>`;
  const yl=[y0,(y0+y1)/2,y1].map(t=>`<text x="${m.l-4}" y="${(py(t)+3).toFixed(1)}" text-anchor="end" font-size="9" fill="#666">${Math.round(t)}</text>`).join("");
  const xlb=[x0,Math.round((x0+x1)/2),x1].map(t=>`<text x="${px(t).toFixed(1)}" y="${H-m.b+13}" text-anchor="middle" font-size="9" fill="#666">${t}</text>`).join("");
  const lines=rows.map(r=>`<polyline points="${r.pts.map(p=>px(p[0]).toFixed(1)+','+py(p[1]).toFixed(1)).join(' ')}" fill="none" stroke="${CLS_COL[r.cls]||'#888'}" stroke-width="1.3" opacity="0.85"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width:560px;border:1px solid #eee">${ax}${yl}${xlb}${lines}</svg>`;
}

export default function RunBuilder({ initState, units = "imperial", simple = false }) {
  // Per-area economics are stored $/ac; convert at display time for the unit toggle.
  const UA = units === "metric" ? 2.471054 : 1;     // $/ac -> $/ha
  const PER = units === "metric" ? "ha" : "ac";
  const mpa = (v) => "$" + fmt(v == null ? v : v * UA);  // money per area, unit-aware
  const [st, setSt] = useState(initState && STATES.includes(initState) ? initState : "ME");
  useEffect(() => { if (initState && STATES.includes(initState)) setSt(initState); }, [initState]);
  const [models, setModels] = useState({ fvs:true, cbm:true, cem:true, yield:true, landis:false });
  const [metric, setMetric] = useState("agc_live_total");
  const [scenarios, setScenarios] = useState([{ mgmt:"reserve", climate:"historic" }, { mgmt:"baseline", climate:"historic" }]);
  const [price, setPrice] = useState("base");
  const [es, setEs] = useState("none");
  const [policy, setPolicy] = useState("none");
  const [emphasis, setEmphasis] = useState("balanced");
  const [dataSource, setDataSource] = useState("fia");
  const [upload, setUpload] = useState(null); // {name, rows, cols}
  const [series, setSeries] = useState(null);
  const [yields, setYields] = useState(null);
  const [hrr, setHrr] = useState(null);
  const [run, setRun] = useState(null);
  const [hpc, setHpc] = useState("idle"); // idle|submitting|queued|running|complete
  const [disc, setDisc] = useState(0.04);   // user-selectable discount rate
  const [estCost, setEstCost] = useState(0);   // establishment cost $/ac (net Faustmann)
  const [mgmtCost, setMgmtCost] = useState(0); // annual management cost $/ac/yr
  const [econParams, setEconParams] = useState(null); // real per-state stumpage
  const base = import.meta.env.BASE_URL || "/";

  useEffect(() => { fetch(`${base}api/yield_curves_by_l3.json`).then(r=>r.json()).then(setYields).catch(()=>{}); }, []);
  useEffect(() => { fetch(`${base}api/hrr_states.json`).then(r=>r.json()).then(setHrr).catch(()=>{}); }, []);
  useEffect(() => { fetch(`${base}api/econ_params.json`).then(r=>r.json()).then(setEconParams).catch(()=>{}); }, []);
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

  // Surveillance (near-term, Guo framework): observed disturbance by named agent,
  // from the FIA disturbance-rate metrics already in the series.
  const latestRate = (key) => { const m = series && series[key]; if(!m) return null;
    const lab = Object.keys(m)[0]; const arr = lab && m[lab];
    const e = arr && arr[0]; return e && e.pts && e.pts.length ? e.pts[e.pts.length-1][1] : null; };
  const distAgents = series ? [["insect","Insects","#d98a3c"],["disease","Disease","#c0504d"],
      ["weather","Weather","#3a6ea5"],["animal","Animal","#2e9e6b"],["human","Human","#8a5cd1"]]
      .map(([k,lbl,col])=>{ const v=latestRate(k+"_rate_state_pct"); return v!=null?{k,lbl,col,v}:null; }).filter(Boolean) : [];
  const anyDist = latestRate("any_disturbance_rate_pct");
  const distMax = distAgents.length ? Math.max(...distAgents.map(a=>a.v)) : 1;

  const selModels = MODELS.filter(([k]) => models[k]);
  const p = PRICE_PATHS[price];
  // Real per-state blended stumpage ($/m3) -> effective $/cu ft for the price scenario.
  const hasRealPrice = !!(econParams && econParams.stumpage_usd_m3[st] != null);
  const stumpageM3 = hasRealPrice ? econParams.stumpage_usd_m3[st] : NATIONAL_STUMPAGE_M3;
  const stumpageCuft = stumpageM3 * M3_PER_CUFT * p.mult;
  const stBasis = econParams && econParams.basis ? econParams.basis[st] : null;   // measured|partial|regional
  const stDetail = econParams && econParams.detail ? econParams.detail[st] : null;
  const priceConf = stBasis==="measured" ? "measured" : stBasis==="partial" ? "saw or pulp imputed regionally" : "regional estimate";
  const esAnnual = (ES_LEVELS.find(([k])=>k===es)||[])[2] || 0;
  // hrr_states.json nests per-state values under `.states` (keyed by state code).
  // Reading hrr[st] directly returned undefined, which blanked the scorecard
  // Resilience/Risk columns; resolve through `.states` so they populate.
  const hrrSt = hrr && hrr.states ? hrr.states[st] : null;
  const stateResil = hrrSt ? hrrSt.resil_mean : null;
  const stateStress = hrrSt ? hrrSt.stress_mean : null;
  const spec = {
    spec_version:"1.0", aoi:{type:"inventory",state:st,scale:"ownership"},
    data_source: dataSource==="user" && upload ? {source:"user",upload_ref:upload.name,n_rows:upload.rows} : {source:dataSource},
    models:selModels.map(([k])=>k),
    assumptions:{ management:[...new Set(scenarios.map(s=>s.mgmt))], climate:[...new Set(scenarios.map(s=>s.climate))], horizon_year:2100, policy },
    markets:{ price_scenario:price, stumpage_usd_per_m3: hasRealPrice ? stumpageM3 : null, carbon_usd_per_tco2e:p.carbon, es_usd_per_ac_yr:esAnnual, discount_rate:disc },
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
      const e = econFromL3(repNode, mg[3], stumpageCuft, p.carbon, disc, estCost, mgmtCost);
      // Timber income is realized only when the stand is harvested; a reserve
      // earns no stumpage. Carbon value accrues under every management (from that
      // management's own carbon trajectory). Total is the explicit sum of the
      // realized components, so the displayed parts always reconcile with it.
      const timber = sc.mgmt==="reserve" ? 0 : (e.npvH||0)*polT(policy);
      const npvC = (e.npvC||0)*polC(policy);
      const esv = (sc.mgmt==="reserve"?1:ES_MANAGED_FRAC) * (esAnnual ? esAnnual*annuity(e.age||100,disc) : 0);
      const total = timber + npvC + esv;
      // multi-criteria: forest-condition outcome (ensemble endpoint mean) + agreement + resilience
      const ends = engines.flatMap(en=>en.rows).map(r=>r.pts[r.pts.length-1][1]);
      const mean = ends.length ? ends.reduce((a,b)=>a+b,0)/ends.length : null;
      const sd = ends.length>1 ? Math.sqrt(ends.reduce((a,b)=>a+(b-mean)**2,0)/ends.length) : 0;
      const agree = mean ? Math.max(0, 1-(sd/Math.abs(mean))) : null;
      const resil = stateResil!=null ? Math.min(1, stateResil*(RESIL_FACTOR[sc.mgmt]||1)) : null;
      const risk = stateStress!=null ? Math.min(1, stateStress*(RISK_FACTOR[sc.mgmt]||1)) : null;
      return { sc, engines, econ:{...e, npvH:timber, npvC, esv, total},
               criteria:{ econ:total, carbon:npvC, es:esv, resil, risk, agree, outcome:mean } };
    });
    setRun({ status:"complete", results });
  }

  // recommendation (reserve vs managed) for this area + market + ES
  const eRes = econFromL3(repNode,"untreated",stumpageCuft,p.carbon,disc,estCost,mgmtCost), eBas = econFromL3(repNode,"harvested",stumpageCuft,p.carbon,disc,estCost,mgmtCost);
  const esAge = eRes.age||eBas.age||100;
  const esFull = esAnnual?esAnnual*annuity(esAge,disc):0, esMan = esFull*ES_MANAGED_FRAC;
  // Mirror the per-scenario economics so the headline matches the scorecard:
  // reserve earns carbon + ES (no stumpage); managed earns timber + its own carbon + ES.
  const reserveTotal=(eRes.npvC||0)*polC(policy)+esFull;
  const managedTotal=(eBas.npvH||0)*polT(policy)+(eBas.npvC||0)*polC(policy)+esMan;
  const carbonLean = reserveTotal>managedTotal;
  const polClause = policy!=="none" ? ` under ${(POLICIES.find(([k])=>k===policy)||[])[1].toLowerCase()}` : "";
  const decision = repNode ? (carbonLean
    ? `At ${p.label.toLowerCase()} prices${esAnnual?" with ES payments":""}${polClause}, this forest is worth more standing (~${mpa(reserveTotal)}/${PER} NPV) than harvested (~${mpa(managedTotal)}/${PER}). A reserve or light-touch strategy looks favorable.`
    : `At ${p.label.toLowerCase()} prices${esAnnual?" even with ES payments":""}${polClause}, active management pays (~${mpa(managedTotal)}/${PER} NPV) over keeping it standing (~${mpa(reserveTotal)}/${PER}). A managed strategy looks favorable.`) : null;

  function submitHPC() {
    setRun(null); setHpc("submitting");
    setTimeout(()=>setHpc("queued"), 700);
    setTimeout(()=>setHpc("running"), 1900);
    setTimeout(()=>{ setHpc("complete"); resolve(); }, 3800);
  }
  function runFree() { setHpc("idle"); resolve(); }
  function onUpload(e){
    const file = e.target.files && e.target.files[0]; if(!file) return;
    const rd = new FileReader();
    rd.onload = () => { const lines = String(rd.result||"").split(/\r?\n/).filter(l=>l.trim());
      setUpload({ name:file.name, rows:Math.max(0,lines.length-1), cols:(lines[0]||"").split(",").length }); };
    rd.readAsText(file);
  }

  function generateReport() {
    if (!run || !run.results) return;
    const { scored, best } = computeScores(run.results, emphasis);
    const esc = s => String(s).replace(/[&<>]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c]));
    const date = new Date().toLocaleDateString();
    const scoreRows = scored.map(({ r, score }) => { const c=r.criteria; const isBest=score>=best-0.001;
      return `<tr${isBest?' style="background:#eaf7f0;font-weight:600"':''}><td>${esc((MGMTS.find(([k])=>k===r.sc.mgmt)||[])[1])} &middot; ${(CLIMATES.find(([k])=>k===r.sc.climate)||[])[1]}</td><td>$${fmt(c.econ)}</td><td>$${fmt(c.carbon)}</td><td>$${fmt(c.es)}</td><td>${c.resil!=null?Math.round(c.resil*100):"&ndash;"}</td><td>${c.risk!=null?Math.round(c.risk*100):"&ndash;"}</td><td>${c.agree!=null?Math.round(c.agree*100)+"%":"&ndash;"}</td><td>${Math.round(score)}${isBest?" &#9733;":""}</td></tr>`; }).join("");
    const scnRows = run.results.map((r,i) => { const present=r.engines.filter(e=>e.rows.length); const eng=present.map(e=>`${e.cls} (${e.rows.length})`).join(", ");
      return `<tr><td>${i+1}. ${esc((MGMTS.find(([k])=>k===r.sc.mgmt)||[])[1])} &middot; ${(CLIMATES.find(([k])=>k===r.sc.climate)||[])[1]}</td><td>${eng||"&mdash;"}</td><td>timber $${fmt(r.econ.npvH)}, carbon $${fmt(r.econ.npvC)}, ES $${fmt(r.econ.esv)}, <b>total $${fmt(r.econ.total)}</b></td></tr>`; }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>PERSEUS Forest Scenario Report &mdash; ${st}</title>
<style>body{font-family:Georgia,serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1a1a1a;line-height:1.5}h1{font-size:21px;margin-bottom:2px}h2{font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px;margin-top:22px}table{border-collapse:collapse;width:100%;font-size:12px;margin:6px 0}th,td{border:1px solid #ccc;padding:4px 7px;text-align:left}.muted{color:#666;font-size:11px}.rec{border-left:4px solid #2e9e6b;padding:8px 12px;background:#f6fbf8;margin:10px 0}pre{background:#f5f5f5;padding:8px;font-size:10px;overflow:auto;white-space:pre-wrap}@media print{body{margin:0}}</style></head><body>
<h1>PERSEUS Forest Scenario Report</h1>
<div class="muted">Area: ${st} &middot; Generated ${date} &middot; Decision-support prototype (illustrative)</div>
<div class="rec"><b>Recommendation.</b> ${decision?esc(decision):"Run scenarios to generate a recommendation."}</div>
<h2>Assumptions</h2>
<p>Models: ${selModels.map(([,l])=>l).join(", ")}. Output metric: ${(METRICS.find(([k])=>k===metric)||[])[1]}. Timber price: ${st} blended stumpage $${fmt(stumpageM3,0)}/m³ (${priceConf}${stDetail&&stDetail.n_min?`, n≈${stDetail.n_min}`:""})${p.label!=="Base"?` × ${p.mult} (${p.label})`:""}. Carbon price: $${p.carbon}/tCO2e (illustrative). Ecosystem-service payment: ${esAnnual?("$"+esAnnual+"/ac/yr"):"none"}. Discount rate: ${(disc*100).toFixed(0)}%. Policy: ${(POLICIES.find(([k])=>k===policy)||[])[1]}. Decision emphasis: ${(EMPH_LABELS.find(([k])=>k===emphasis)||[])[1]}. Horizon: 2100.</p>
<h2>Multi-criteria scorecard</h2>
<table><thead><tr><th>Scenario</th><th>Total $/ac</th><th>Carbon $</th><th>Eco-svc $</th><th>Resilience</th><th>Risk</th><th>Model agreement</th><th>Score</th></tr></thead><tbody>${scoreRows}</tbody></table>
<h2>Scenario detail (multi-model ensemble)</h2>
<table><thead><tr><th>Scenario</th><th>Engines (model runs)</th><th>Economics (NPV per acre)</th></tr></thead><tbody>${scnRows}</tbody></table>
<h2>Ensemble trajectories</h2>
${run.results.map((r,i)=>`<div style="font-size:12px;font-weight:600;margin:10px 0 2px">Scenario ${i+1}: ${esc((MGMTS.find(([k])=>k===r.sc.mgmt)||[])[1])} &middot; ${(CLIMATES.find(([k])=>k===r.sc.climate)||[])[1]}</div>${svgFor(r.engines.flatMap(e=>e.rows))}`).join("")}
<h2>Run specification (Cardinal contract)</h2>
<pre>${esc(JSON.stringify(spec,null,2))}</pre>
<h2>Methods &amp; caveats</h2>
<p class="muted">Free-tier results resolve from precomputed PERSEUS multi-model series (FVS, CBM, CEM, yield) by state, management, and metric; model spread is the honest uncertainty. Economics use per-acre yield curves with real per-state blended stumpage for timber and the chosen discount rate. Timber value is the optimal single-rotation (Faustmann) NPV at rotation age R*, with the perpetual land value (LEV) also reported; gross of establishment and management costs. The carbon price is anchored to voluntary and compliance market benchmarks (the EPA social cost of carbon, ~$190/tCO2e, is higher but is a societal value, not a payment); ecosystem-service payments and policy effects are illustrative. Resilience is the state HRR baseline with an illustrative management adjustment. A subscriber custom run dispatches the run-spec above to the OSC Cardinal HPC cluster for the exact area and inventory. This prototype is for discussion, not financial or management advice.</p>
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `PERSEUS_report_${st}_${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const setScn=(i,k,v)=>setScenarios(s=>s.map((r,j)=>j===i?{...r,[k]:v}:r));
  const addScn=()=>setScenarios(s=>[...s,{mgmt:(availMgmts[0]||MGMTS[0])[0],climate:"rcp45"}]);
  const rmScn=(i)=>setScenarios(s=>s.length>1?s.filter((_,j)=>j!==i):s);
  const sel={background:"var(--panel)",color:"var(--ink)",border:"1px solid var(--line)",borderRadius:5,padding:"2px 6px",fontSize:11};
  const chip=(on,col)=>({fontSize:11,padding:"2px 9px",borderRadius:4,cursor:"pointer",border:`1px solid ${on?(col||"#3a6ea5"):"var(--bd,#345)"}`,background:on?(col||"#3a6ea5"):"transparent",color:on?"#fff":"var(--fg,#cdd)"});
  const HPC_STEP={submitting:["Submitting run-spec to Cardinal…",15],queued:["Queued on SLURM (PUOM0008)…",40],running:["Running ensemble: FVS, CBM, CEM, yield…",75],complete:["Complete — results delivered",100]};

  return (
    <div>
      <div className="who" style={{marginBottom:6}}><b>Build a run</b> <span style={{color:"var(--mut)"}}>· select an area, choose models, build scenarios, submit</span></div>
      <div className="note" style={{margin:"0 0 8px",padding:"6px 9px",borderRadius:6,background:"rgba(63,182,139,0.08)",border:"1px solid var(--line)"}}>New here? Pick a state, keep the default models and the two scenarios, and press <b>Run free</b>. Then change the market, policy, or emphasis and watch the recommendation update.</div>

      {/* 1. area */}
      <div className="chartcard" style={{padding:"8px 10px",marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--mut)",marginBottom:4}}>1 · Area of interest</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",fontSize:11}}>
          <span style={{color:"var(--mut)"}}>State (ownership):</span>
          <select value={st} onChange={e=>setSt(e.target.value)} style={sel}>{STATES.map(s=><option key={s} value={s}>{s}</option>)}</select>
          <span style={{color:"var(--mut)"}}>{series===null?"loading area data…":`${availMetrics.length} metrics available`}</span>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,marginTop:6}}>
          <span style={{color:"var(--mut)"}}>Data source:</span>
          {[["fia","FIA"],["treemap","TreeMap"],["user","Upload inventory"]].map(([k,lbl])=><span key={k} style={chip(dataSource===k)} onClick={()=>setDataSource(k)}>{lbl}</span>)}
          {dataSource==="user" && <input type="file" accept=".csv,.txt" onChange={onUpload} style={{fontSize:10}}/>}
        </div>
        {dataSource==="user" && upload && <div className="note" style={{marginTop:3}}>Loaded {upload.name}: {upload.rows} rows × {upload.cols} columns. A subscriber run initializes stands from this inventory on Cardinal.</div>}
        {dataSource!=="fia" && <div className="note" style={{marginTop:3,color:"#8a5cd1"}}>{dataSource==="treemap"?"TreeMap":"Your inventory"} drives a subscriber Cardinal run; the free preview below uses precomputed FIA results for {st}.</div>}
        <div className="note" style={{marginTop:4}}>States are the precomputed unit here. A subscriber run takes a drawn AOI or uploaded inventory at any scale, crossing state lines, and resolves the same way.</div>
      </div>

      {/* surveillance (near-term, Guo framework) */}
      {distAgents.length > 0 && (
        <div className="chartcard" style={{padding:"8px 10px",marginBottom:8}}>
          <div style={{fontSize:11,color:"var(--mut)",marginBottom:4}}>Forest-health surveillance · near-term · observed disturbance by agent ({st})</div>
          {anyDist!=null && <div style={{fontSize:12,marginBottom:5}}>Any disturbance affects <b>{anyDist.toFixed(1)}%</b> of forest area (FIA).</div>}
          {distAgents.map(a=>(
            <div key={a.k} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,marginBottom:3}}>
              <span style={{width:58,color:"var(--mut)"}}>{a.lbl}</span>
              <div style={{flex:1,height:9,background:"var(--panel)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:Math.max(2,a.v/distMax*100)+"%",background:a.col}}/>
              </div>
              <span style={{width:42,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{a.v.toFixed(1)}%</span>
            </div>
          ))}
          <div className="note" style={{marginTop:4}}>Named-agent disturbance rates (FIA). This is the framework's near-term surveillance layer; the scenario engine below is the longer-term assessment. Available where FIA disturbance coding is complete; expanding CONUS-wide is on the roadmap.</div>
        </div>
      )}

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
        <div className="note" style={{marginTop:6}}>Climate pathways currently share the baseline yield curves for most engines; calibrated climate scaling (CEM) is in progress, so historic and RCP may read similarly until it lands. Timber value uses real per-state blended stumpage, and carbon a market-anchored price (voluntary/compliance); ES payments and policy multipliers are illustrative.</div>
        <details open={!simple} style={{marginTop:8}}>
          <summary style={{fontSize:11,color:"var(--mut)",cursor:"pointer"}}>Market, ecosystem-service, policy &amp; discount rate</summary>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,marginTop:6}}>
            <span style={{color:"var(--mut)"}}>Market:</span>
            {Object.entries(PRICE_PATHS).map(([k,v])=><span key={k} style={chip(price===k)} onClick={()=>setPrice(k)}>{v.label}</span>)}
            <span style={{color:"var(--mut)",marginLeft:6}}>ES:</span>
            {ES_LEVELS.map(([k,lbl])=><span key={k} style={chip(es===k)} onClick={()=>setEs(k)}>{lbl}</span>)}
          </div>
          <div className="note" style={{marginTop:2}}>Timber priced from <b>{st}</b> blended stumpage <b>${fmt(stumpageM3,0)}/m³</b> <span style={{color:"var(--mut)"}}>({priceConf}{stDetail&&stDetail.region?`, ${stDetail.saw_share*100|0}% sawtimber mix`:""}{stDetail&&stDetail.n_min?`, n≈${stDetail.n_min}`:""})</span>{price!=="base" ? ` × ${p.mult} (${p.label})` : ""}. <span style={{color:"#8a5cd1"}}>Carbon ${p.carbon}/tCO₂e, market-anchored (voluntary ~15, CA compliance ~35, ceiling ~95; societal cost ~190). ES illustrative.</span></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,marginTop:6}}>
            <span style={{color:"var(--mut)"}}>Policy:</span>
            <select value={policy} onChange={e=>setPolicy(e.target.value)} style={sel}>{POLICIES.map(([k,lbl])=><option key={k} value={k}>{lbl}</option>)}</select>
            <span style={{color:"var(--mut)",marginLeft:6}}>Discount rate:</span>
            {DISC_RATES.map(([k,lbl])=><span key={k} style={chip(disc===+k)} onClick={()=>setDisc(+k)}>{lbl}</span>)}
          </div>
          {!simple && (
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",fontSize:11,marginTop:6}}>
            <span style={{color:"var(--mut)"}}>Rotation costs ($/ac):</span>
            <span style={{color:"var(--mut)"}}>establishment</span>
            <input type="number" min="0" step="50" value={estCost} onChange={e=>setEstCost(Math.max(0,+e.target.value||0))} style={{...sel,width:70}}/>
            <span style={{color:"var(--mut)"}}>annual mgmt</span>
            <input type="number" min="0" step="1" value={mgmtCost} onChange={e=>setMgmtCost(Math.max(0,+e.target.value||0))} style={{...sel,width:60}}/>
            <span style={{color:"var(--mut)",fontSize:10}}>net Faustmann; 0 = gross of costs</span>
          </div>)}
        </details>
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
      {run && run.results && <div style={{margin:"2px 0 8px"}}><button onClick={generateReport} className="mini-btn" style={{borderStyle:"solid",fontSize:12,padding:"4px 12px"}}>⬇ Download report (HTML · print to PDF)</button></div>}
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
              <div className="note" style={{marginTop:4}}>Economics (NPV/{PER}, {p.label} market{esAnnual?`, ES $${esAnnual}/ac/yr`:""}): timber {mpa(r.econ.npvH)} · carbon {mpa(r.econ.npvC)} · eco-services {mpa(r.econ.esv)} · <b>total {mpa(r.econ.total)}</b> <span style={{color:"var(--mut)"}}>· timber: real stumpage; <span style={{color:"#8a5cd1"}}>carbon market-anchored</span></span>{r.sc.mgmt!=="reserve" && r.econ.rotation ? <span style={{color:"var(--mut)"}}> · optimal rotation <b>{r.econ.rotation} yr</b>, Faustmann land value {mpa(r.econ.lev)}/{PER}</span> : null}</div>
            )}
          </div>
        );
      })}
      {run && run.results && run.results.length>0 && (() => {
        const { scored, best } = computeScores(run.results, emphasis);
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
                <th style={{fontWeight:500}}>Total $/{PER}</th><th style={{fontWeight:500}}>Carbon $</th><th style={{fontWeight:500}}>Eco-svc $</th>
                <th style={{fontWeight:500}}>Resilience</th><th style={{fontWeight:500}}>Risk</th><th style={{fontWeight:500}}>Agreement</th><th style={{fontWeight:500}}>Score</th>
              </tr></thead>
              <tbody>
                {scored.map(({r,score},i)=>{ const c=r.criteria; const isBest=score>=best-0.001;
                  return (
                    <tr key={i} style={{textAlign:"right",borderTop:"1px solid var(--line,#345)",background:isBest?"rgba(46,158,107,0.12)":"transparent"}}>
                      <td style={{textAlign:"left"}}>{(MGMTS.find(([k])=>k===r.sc.mgmt)||[])[1]} · {(CLIMATES.find(([k])=>k===r.sc.climate)||[])[1]}</td>
                      <td>{mpa(c.econ)}</td><td>{mpa(c.carbon)}</td><td>{mpa(c.es)}</td>
                      <td>{c.resil!=null?Math.round(c.resil*100):"–"}</td>
                      <td style={{color:c.risk!=null?(c.risk>0.4?"#c0504d":"var(--ink)"):"var(--mut)"}}>{c.risk!=null?Math.round(c.risk*100):"–"}</td>
                      <td>{c.agree!=null?Math.round(c.agree*100)+"%":"–"}</td>
                      <td style={{fontWeight:700,color:isBest?"#2e9e6b":"var(--ink)"}}>{Math.round(score)}{isBest?" ★":""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="note" style={{marginTop:4}}>Each scenario scored 0–100 across economic value, carbon, ecosystem services, resilience, disturbance/climate risk (lower is better), and cross-model agreement, weighted by your emphasis. Resilience and risk come from the state HRR layer with an illustrative management adjustment. This is the multi-criteria, multi-model basis that sets PERSEUS apart from single-objective tools.</div>
          </div>
        );
      })()}
      {run && run.results && <div className="note" style={{color:"var(--mut)"}}>Each line is one model run; spread between engines is the honest uncertainty. Economics from per-acre yield curves for the representative ecoregion. This is the ensemble and valuation a subscriber gets on demand for their exact area.</div>}
    </div>
  );
}
