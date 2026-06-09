// Self-contained area-report generator. Compiles everything already computed for
// an AOI (identity, FIA attributes, landowner, surrounding-landscape metrics,
// stumpage, and the untreated-vs-harvested management outlook) into a clean,
// brandable, printable HTML document the user can save or print to PDF. This is
// the "research explorer -> decision-support deliverable" bridge.

const interp = (curve, age) => {
  if(!curve || !curve.length) return null;
  if(age <= curve[0][0]) return curve[0][1];
  if(age >= curve[curve.length-1][0]) return curve[curve.length-1][1];
  for(let i=1;i<curve.length;i++){
    const [xa,ya]=curve[i-1],[xb,yb]=curve[i];
    if(age>=xa && age<=xb){ const t=(age-xa)/((xb-xa)||1); return ya+t*(yb-ya); }
  }
  return null;
};
const esc = (s) => String(s==null?"":s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
import { conv, unitLabel, fmtArea as fmtAreaU } from "./units.js";
const num = (v,d=0) => v==null?"—":Number(v).toLocaleString(undefined,{maximumFractionDigits:d});

// ---- multi-model ensemble helpers (mirror the Engine-compare default filter) ----
const REP_OUTLIER = m => (/(fvs.*(native|jenkins))/i.test(m) && !/(anchored|calibrated)/i.test(m)) || /wear_nh/i.test(m);
function repAtYear(pts, yr){
  if(!pts || !pts.length) return null;
  if(yr < pts[0][0] || yr > pts[pts.length-1][0]) return null;
  for(let i=1;i<pts.length;i++){ if(yr <= pts[i][0]){ const [a0,v0]=pts[i-1],[a1,v1]=pts[i];
    const f=(yr-a0)/((a1-a0)||1); return v0+f*(v1-v0); } }
  return pts[pts.length-1][1];
}
function repEnsemble(series, metric, bucket, yr){
  const arr = series && series[metric] && series[metric][bucket];
  if(!arr) return null;
  const obs=[];
  arr.filter(e=>!REP_OUTLIER(e.model)).forEach(e=>{ const v=repAtYear(e.pts,yr); if(v!=null) obs.push({v,cls:e.cls}); });
  if(obs.length < 3) return null;
  const vals=obs.map(o=>o.v), n=vals.length, mean=vals.reduce((a,b)=>a+b,0)/n;
  const lo=Math.min(...vals), hi=Math.max(...vals);
  const sd=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n);
  const cv=mean?sd/Math.abs(mean):0, spreadPct=lo?(hi-lo)/Math.abs(lo)*100:0;
  const byFam={}; obs.forEach(o=>{ (byFam[o.cls]=byFam[o.cls]||[]).push(o.v); });
  const fams=Object.entries(byFam).map(([fam,vs])=>({fam,n:vs.length,mean:vs.reduce((a,b)=>a+b,0)/vs.length})).sort((a,b)=>b.mean-a.mean);
  return { n, mean, lo, hi, cv, spreadPct, fams };
}
const REPORT_METRICS = ["agc_live_total","total_ecosystem_c","dead_wood_c","standing_value_musd","merch_vol_mcf","vol_stem"];
async function fetchModelSummary(state, bucket = "managed (harvest)", year = 2050){
  if(!state) return null;
  const B = import.meta.env.BASE_URL;
  try{
    const [s,m] = await Promise.all([
      fetch(`${B}api/series/${state}.json`).then(r=>r.ok?r.json():null),
      fetch(`${B}api/meta.json`).then(r=>r.ok?r.json():null),
    ]);
    if(!s) return null;
    const lab = k => (m && m.metrics && m.metrics[k]) ? m.metrics[k].label : k;
    const unit = k => (m && m.metrics && m.metrics[k]) ? m.metrics[k].unit : "";
    const metrics = REPORT_METRICS
      .map(k => { const ens = repEnsemble(s, k, bucket, year); return ens ? { key:k, label:lab(k), unit:unit(k), ens } : null; })
      .filter(Boolean);
    return { bucket, year, metrics };
  }catch(e){ return null; }
}

function buildReportHTML(aoi, stumpage, system = "imperial", model = null){
  const { name, l3code, l3name, l1, centroid, area_m2, state, plotStats, landscape, allCurves } = aoi || {};
  const today = new Date().toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
  const ps = plotStats, ls = landscape || {};
  const cvNum = (v, u, d=0) => v==null?"—":`${conv(v,u,system).value.toFixed(d)} ${conv(v,u,system).unit}`;
  const price = (v, u) => v==null?"—":`$${Math.round(conv(v,u,system).value)}/${conv(v,u,system).unit.replace("$/","")}`;

  const row = (k,v) => `<tr><td class="k">${esc(k)}</td><td class="v">${v}</td></tr>`;
  const bar = (label, pct, color) => `<div class="bar"><span class="bl">${esc(label)}</span>
    <span class="bt"><i style="width:${Math.max(0,Math.min(100,pct))}%;background:${color}"></i></span>
    <span class="bp">${Math.round(pct)}%</span></div>`;

  // ---- condition-index radar (6 axes, ecoregion percentile) ----
  const aV = x => (x && typeof x==="object") ? x.v : x;   // tolerate number or {v,lo,hi,ref}
  let radar = "";
  if(ls.index){
    const AX=[["carbon","Carbon"],["value","Timber value"],["productivity","Productivity"],["resilience","Resilience"],["habitat","Habitat"],["biodiversity","Biodiversity"]];
    const N=AX.length, C=110, R=78, ang=i=>(-90+i*360/N)*Math.PI/180, pt=(i,r)=>[C+r*Math.cos(ang(i)),C+r*Math.sin(ang(i))];
    const cl=v=>v==null?null:Math.max(0,Math.min(1,v));
    const rings=[0.25,0.5,0.75,1].map(f=>`<circle cx="${C}" cy="${C}" r="${(R*f).toFixed(1)}" fill="none" stroke="${f===0.5?'#9aa7af':'#d8e0e3'}"${f===0.5?' stroke-dasharray="3 3"':''}/>`).join("");
    const spokes=AX.map((_,i)=>{const[x,y]=pt(i,R);return `<line x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d8e0e3"/>`;}).join("");
    const poly=AX.map((a,i)=>{const v=cl(aV(ls.index[a[0]]))||0;return pt(i,R*v).map(n=>n.toFixed(1)).join(",");}).join(" ");
    const hasRef=AX.some(a=>{const o=ls.index[a[0]];return o&&o.ref!=null;});
    const refPoly=hasRef?AX.map((a,i)=>{const o=ls.index[a[0]];const r=(o&&o.ref!=null)?cl(o.ref):0;return pt(i,R*r).map(n=>n.toFixed(1)).join(",");}).join(" "):"";
    const ebars=AX.map((a,i)=>{const o=ls.index[a[0]];if(!o||o.lo==null||o.hi==null||o.lo===o.hi)return"";const[x1,y1]=pt(i,R*cl(o.lo)),[x2,y2]=pt(i,R*cl(o.hi));const nx=Math.cos(ang(i)+Math.PI/2)*2.4,ny=Math.sin(ang(i)+Math.PI/2)*2.4;return `<g stroke="#7bbf9a" stroke-width="1.1"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><line x1="${(x1-nx).toFixed(1)}" y1="${(y1-ny).toFixed(1)}" x2="${(x1+nx).toFixed(1)}" y2="${(y1+ny).toFixed(1)}"/><line x1="${(x2-nx).toFixed(1)}" y1="${(y2-ny).toFixed(1)}" x2="${(x2+nx).toFixed(1)}" y2="${(y2+ny).toFixed(1)}"/></g>`;}).join("");
    const labels=AX.map(([k,lab],i)=>{const[x,y]=pt(i,R+15);const anc=Math.abs(x-C)<5?'middle':(x>C?'start':'end');return `<text x="${x.toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="${anc}" font-size="10" fill="#1a3d28">${esc(lab)}</text>`;}).join("");
    const NM={carbon:"carbon",value:"timber value",productivity:"productivity",habitat:"habitat",biodiversity:"biodiversity",resilience:"resilience"};
    const good=Object.entries(ls.index).filter(([k,v])=>k!=="biodiversity"&&aV(v)!=null).map(([k,v])=>[k,aV(v)]).sort((a,b)=>b[1]-a[1]);
    let narr="";
    if(good.length>=2){ const hi=good[0],lo=good[good.length-1];
      const rk=ls.index.resilience!=null?` Resilience to disturbance sits around the ${Math.round(aV(ls.index.resilience)*100)}th percentile.`:"";
      narr=`<p class="note" style="text-align:center;margin:2px 0 0">Within its ecoregion this area ranks highest on ${NM[hi[0]]} (${Math.round(hi[1]*100)}th pct) and lowest on ${NM[lo[0]]} (${Math.round(lo[1]*100)}th pct).${rk}</p>`; }
    const refLeg=hasRef?`<p class="note" style="text-align:center;margin:0">Solid = this area · dashed grey = state average · whiskers = within-area spread.</p>`:"";
    // composite grade
    const gvals=AX.map(a=>aV(ls.index[a[0]])).filter(v=>v!=null);
    let gradeHtml="";
    if(gvals.length>=3){ const comp=gvals.reduce((a,b)=>a+b,0)/gvals.length;
      const G=comp>=0.80?["A","#2e9e6b"]:comp>=0.60?["B","#5cb85c"]:comp>=0.40?["C","#caa300"]:comp>=0.20?["D","#d2691e"]:["F","#c0392b"];
      gradeHtml=`<p style="text-align:center;margin:0 0 2px"><span style="display:inline-block;min-width:30px;padding:2px 8px;border:2px solid ${G[1]};border-radius:8px;color:${G[1]};font-weight:700;font-size:18px">${G[0]}</span> <span class="sub">overall ${Math.round(comp*100)}th percentile in its ecoregion</span></p>`; }
    radar = `<h2>Condition index <span class="sub">each axis = this area's percentile within its ecoregion (dashed ring = regional median); biodiversity is a stand diversity index</span></h2>${gradeHtml}
      <svg viewBox="0 0 220 236" style="width:290px;display:block;margin:2px auto">${rings}${spokes}
      ${refPoly?`<polygon points="${refPoly}" fill="none" stroke="#9aa7b0" stroke-width="1.1" stroke-dasharray="4 3"/>`:""}
      <polygon points="${poly}" fill="#3fb68b" fill-opacity="0.20" stroke="#1a7a4d" stroke-width="2"/>${ebars}${labels}</svg>${narr}${refLeg}`;
  }

  // ---- RD trajectory (2016/2020/2022) with 0.30-0.60 sweet spot ----
  let rdTraj = "";
  if(ls.rdSeries){
    const pts=ls.rdSeries.filter(p=>p.rd!=null);
    if(pts.length>=2){
      const W=300,H=130,ml=34,mr=54,mt=12,mb=22,x0=ml,x1=W-mr,y0=mt,y1=H-mb;
      const yMax=Math.max(0.9,...pts.map(p=>p.rd))*1.05, yr0=2016,yr1=2022;
      const sx=yr=>x0+(yr-yr0)/(yr1-yr0)*(x1-x0), sy=rd=>y1-(rd/yMax)*(y1-y0);
      const line=pts.map(p=>`${sx(p.year).toFixed(1)},${sy(p.rd).toFixed(1)}`).join(" ");
      const latest=pts[pts.length-1].rd, pos=latest<0.30?"below":latest>0.60?"above":"within";
      const msg=pos==="within"?`Latest RD ${latest.toFixed(2)} sits in the 0.30–0.60 sweet spot (near-optimal growth, low density-driven mortality).`:pos==="below"?`Latest RD ${latest.toFixed(2)} is below the 0.30–0.60 sweet spot (understocked; growing space available).`:`Latest RD ${latest.toFixed(2)} is above the 0.30–0.60 sweet spot (dense; a thinning candidate to lower mortality and risk).`;
      const grid=[0,0.3,0.6,0.9].filter(t=>t<=yMax).map(t=>`<text x="${x0-4}" y="${(sy(t)+3).toFixed(1)}" font-size="9" text-anchor="end" fill="#6a7c84">${t.toFixed(1)}</text>`).join("");
      const dots=pts.map(p=>`<circle cx="${sx(p.year).toFixed(1)}" cy="${sy(p.rd).toFixed(1)}" r="3.2" fill="#1d7e0f"/><text x="${sx(p.year).toFixed(1)}" y="${y1+13}" font-size="9.5" text-anchor="middle" fill="#6a7c84">${p.year}</text><text x="${sx(p.year).toFixed(1)}" y="${(sy(p.rd)-6).toFixed(1)}" font-size="9" text-anchor="middle" fill="#1a3d28">${p.rd.toFixed(2)}</text>`).join("");
      rdTraj=`<h2>Relative density over time <span class="sub">2016 → 2022 · TreeMap-basis overlays</span></h2>
        <svg viewBox="0 0 ${W} ${H}" style="width:340px;display:block;margin:0 auto">
        <rect x="${x0}" y="${sy(0.60).toFixed(1)}" width="${x1-x0}" height="${(sy(0.30)-sy(0.60)).toFixed(1)}" fill="#3fb68b" opacity="0.13"/>
        <text x="${x1+3}" y="${(sy(0.45)+3).toFixed(1)}" font-size="9" fill="#1a7a4d">sweet spot</text>
        <text x="${x1+3}" y="${(sy(0.45)+13).toFixed(1)}" font-size="8.5" fill="#6a7c84">0.30–0.60</text>
        <line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="#d8e0e3"/><line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="#d8e0e3"/>
        ${grid}<polyline points="${line}" fill="none" stroke="#1d7e0f" stroke-width="2"/>${dots}</svg>
        <p class="note" style="text-align:center;margin:2px 0 0">${msg}</p>`;
    }
  }

  // ---- identity ----
  let html = `<table class="kv">`;
  if(area_m2) html += row("Area", fmtAreaU(area_m2, system));
  if(centroid) html += row("Centroid", `${centroid[1].toFixed(3)}°, ${centroid[0].toFixed(3)}°`);
  html += row("State", esc(state||"—"));
  html += row("EPA L3 ecoregion", l3code?`${esc(l3code)} ${esc(l3name||"")}`:"—");
  if(l1) html += row("Biome (L1)", esc(l1));
  html += `</table>`;

  // ---- FIA attributes ----
  let attrs = "";
  if(ps && ps.n>0){
    attrs += `<h2>Forest attributes <span class="sub">${ps.n} FIA plots${ps.invYears?` · ${ps.invYears[0]}–${ps.invYears[1]}`:""}</span></h2><table class="kv">`;
    if(ps.meanAge!=null) attrs += row("Mean stand age", `${num(ps.meanAge)} yr`);
    if(ps.meanBA!=null) attrs += row("Mean live basal area", cvNum(ps.meanBA, "sq ft/ac"));
    attrs += `</table>`;
    if(ps.forestTypes && ps.forestTypes.length){
      attrs += `<div class="bars">` + ps.forestTypes.map(f=>bar(f.label, f.pct, "#3fb68b")).join("") + `</div>`;
    }
  }

  // ---- landowner ----
  let owners = "";
  const ownList = (ps && ps.ownership && ps.ownership.length) ? ps.ownership : (ls.ownership||[]);
  if(ownList && ownList.length){
    const OWN = {"Private (Family/Corporate)":"#3fb68b","State / Local":"#6baed6","Other Federal":"#3C5488","Tribal":"#8c510a","National Forest":"#8da0cb"};
    owners = `<h2>Landowner composition</h2><div class="bars">` +
      ownList.map(o=>bar(o.label, o.pct, OWN[o.label]||"#888")).join("") + `</div>`;
  }

  // ---- surrounding landscape ----
  let land = "";
  const GH={High:"#3fb68b",Moderate:"#e6ab02",Low:"#d9734f"}, GL={Low:"#3fb68b",Moderate:"#e6ab02",High:"#d9534f"};
  const lrows=[];
  if(ls.forestFrac!=null) lrows.push(row("Forest cover (area)", `${Math.round(ls.forestFrac*100)}%`));
  if(ls.risk) lrows.push(row("Disturbance risk (2022)", `<b style="color:${GL[ls.risk.band]}">${ls.risk.band}</b> (mean P=${ls.risk.mean.toFixed(2)})`));
  if(ls.habitat) lrows.push(row("Habitat quality (indicative)", `<b style="color:${GH[ls.habitat.band]}">${ls.habitat.band}</b>`));
  if(ls.biodiversity) lrows.push(row("Biodiversity (indicative)", `<b style="color:${GH[ls.biodiversity.band]}">${ls.biodiversity.band}</b>`));
  if(ls.siteProductivity) lrows.push(row("Site productivity (CSPI)", `<b style="color:${GH[ls.siteProductivity.band]}">${ls.siteProductivity.band}</b>`));
  if(ls.speciesValue) lrows.push(row("Species value (SVI)", `<b style="color:${GH[ls.speciesValue.band]}">${ls.speciesValue.band}</b>`));
  if(lrows.length) land = `<h2>Surrounding landscape <span class="sub">sampled from CONUS layers</span></h2><table class="kv">${lrows.join("")}</table>`;

  // ---- stumpage ----
  let stump = "";
  if(ls.stumpage){
    const s=ls.stumpage, r=[];
    if(s.sawSW!=null) r.push(row("Sawlog · softwood", price(s.sawSW,"$/MBF")));
    if(s.sawHW!=null) r.push(row("Sawlog · hardwood", price(s.sawHW,"$/MBF")));
    if(s.pulpSW!=null) r.push(row("Pulpwood · softwood", price(s.pulpSW,"$/cord")));
    if(s.pulpHW!=null) r.push(row("Pulpwood · hardwood", price(s.pulpHW,"$/cord")));
    if(r.length) stump = `<h2>Stumpage prices${state?` · ${esc(state)}`:""}</h2><table class="kv">${r.join("")}</table>`;
  }

  // ---- management outlook (untreated vs harvested AGB) ----
  let outlook = "";
  const agb = allCurves && allCurves.agb_tonac;
  if(agb && agb.untreated && agb.harvested){
    const ages=[5,25,50,75,100];
    const f = conv(1, "ton/ac", system).value, U = unitLabel("ton/ac", system);
    const cells = a => `<td>${num(interp(agb.untreated,a)*f)}</td><td>${num(interp(agb.harvested,a)*f)}</td>`;
    outlook = `<h2>Management outlook <span class="sub">above-ground biomass, ${U}</span></h2>
      <table class="proj"><thead><tr><th>Stand age (yr)</th>${ages.map(a=>`<th colspan=2>${a}</th>`).join("")}</tr>
      <tr><th></th>${ages.map(()=>`<th>reserve</th><th>managed</th>`).join("")}</tr></thead>
      <tbody><tr><td>AGB (${U})</td>${ages.map(cells).join("")}</tr></tbody></table>
      <p class="note">Reserve = unharvested trajectory; managed = working-forest (harvest) trajectory, both from the ycX yield curves for the encompassing ecoregion.</p>`;
  }

  // ---- multi-model agreement section ----
  let modelSec = "";
  if(model && model.metrics && model.metrics.length){
    const FAM = { CBM:"CBM", CEM:"CEM", FVS:"FVS", LANDIS:"LANDIS", YC:"Yield curves" };
    const FCOL = { CBM:"#2e9e6b", CEM:"#3b7fb8", FVS:"#c08a1e", LANDIS:"#b5562a", YC:"#6b6fae" };
    const fmtv = v => Math.abs(v)>=100 ? Math.round(v).toLocaleString() : (Math.abs(v)>=1 ? v.toFixed(1) : v.toFixed(2));
    const barSvg = (e) => {
      const W=300, H=22, ml=5, mr=5, ax=12, span=(e.hi-e.lo)||1;
      const X = v => (ml + (v-e.lo)/span*(W-ml-mr)).toFixed(1);
      const dots = e.fams.map(f=>`<circle cx="${X(f.mean)}" cy="${ax}" r="3.6" fill="${FCOL[f.fam]||"#888"}" stroke="#fff" stroke-width="0.6"></circle>`).join("");
      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:330px;display:block;margin:2px 0 1px"><line x1="${X(e.lo)}" y1="${ax}" x2="${X(e.hi)}" y2="${ax}" stroke="#cfd8db" stroke-width="2"/><line x1="${X(e.mean)}" y1="${ax-7}" x2="${X(e.mean)}" y2="${ax+7}" stroke="#5e7180" stroke-width="1.3"/>${dots}<text x="${X(e.lo)}" y="${ax-9}" font-size="8" fill="#8aa0b0">${fmtv(e.lo)}</text><text x="${X(e.hi)}" y="${ax-9}" font-size="8" text-anchor="end" fill="#8aa0b0">${fmtv(e.hi)}</text></svg>`;
    };
    const block = (e, label, unit) => {
      if(!e) return "";
      const agree = e.cv<0.20 ? "strong agreement" : e.cv<0.45 ? "moderate divergence" : "wide divergence";
      const col = e.cv<0.20 ? "#2e9e6b" : e.cv<0.45 ? "#b8860b" : "#c0392b";
      const fams = e.fams.map(f=>`${esc(FAM[f.fam]||f.fam)} ${fmtv(f.mean)}${f.n>1?` (n=${f.n})`:""}`).join(" &middot; ");
      return `<div style="margin:7px 0 0;border-bottom:1px solid #eef2f3;padding-bottom:5px">`
        + `<div style="font-size:12.5px"><b>${esc(label)}</b> &mdash; ensemble <b>${fmtv(e.mean)}</b> ${esc(unit||"")}, range ${fmtv(e.lo)}&ndash;${fmtv(e.hi)} &middot; spread ${Math.round(e.spreadPct)}% &middot; CV ${e.cv.toFixed(2)} <b style="color:${col}">${agree}</b></div>`
        + barSvg(e)
        + `<div class="note" style="margin:1px 0 0">${fams}</div></div>`;
    };
    const mrows = model.metrics.map(mm => block(mm.ens, mm.label, mm.unit)).join("");
    const famsUsed = [...new Set([].concat(...model.metrics.map(mm => mm.ens ? mm.ens.fams.map(f=>f.fam) : [])))];
    const legend = famsUsed.map(f=>`<span style="display:inline-block;margin-right:10px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${FCOL[f]||"#888"};vertical-align:middle;margin-right:3px"></span>${esc(FAM[f]||f)}</span>`).join("");
    if(mrows) modelSec = `<h2>Multi-model agreement <span class="sub">cross-engine ensemble &middot; ${esc(model.bucket)} &middot; ${esc(String(model.year))}</span></h2><p class="note" style="margin:0 0 2px">${legend}</p>${mrows}<p class="note">Each dot is a model family's mean; the bar is the across-model range and the tick is the ensemble mean. State-level ensemble; uncalibrated FVS variants excluded to match the engine-comparison default. Wide spread means high structural uncertainty &mdash; treat single-model numbers with caution.</p>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>PERSEUS Area Report</title>
<style>
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a2530;margin:0;background:#f4f6f7}
  .page{max-width:780px;margin:0 auto;background:#fff;padding:34px 44px 48px;box-shadow:0 1px 6px rgba(0,0,0,.12)}
  header{border-bottom:3px solid #1a3d28;padding-bottom:10px;margin-bottom:18px}
  header h1{font-size:20px;margin:0;color:#1a3d28}
  header .meta{color:#5e7180;font-size:12.5px;margin-top:3px}
  h2{font-size:14px;color:#1a3d28;border-bottom:1px solid #d8e0e3;padding-bottom:4px;margin:22px 0 8px}
  h2 .sub{font-weight:400;color:#8aa0b0;font-size:11.5px}
  table.kv{width:100%;border-collapse:collapse}
  table.kv td{padding:3px 0;font-size:13px;border-bottom:1px solid #eef2f3}
  table.kv td.k{color:#5e7180}
  table.kv td.v{text-align:right;font-variant-numeric:tabular-nums}
  .bars{margin:6px 0}
  .bar{display:grid;grid-template-columns:150px 1fr 42px;align-items:center;gap:8px;font-size:12px;margin:3px 0}
  .bar .bl{color:#39505e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar .bt{height:10px;background:#eef2f3;border-radius:3px;overflow:hidden}
  .bar .bt i{display:block;height:100%;border-radius:3px}
  .bar .bp{text-align:right;font-variant-numeric:tabular-nums;color:#5e7180}
  table.proj{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;margin-top:6px}
  table.proj th,table.proj td{border:1px solid #d8e0e3;padding:4px 7px;text-align:right}
  table.proj th{background:#f0f4f2;color:#1a3d28}
  table.proj td:first-child,table.proj th:first-child{text-align:left}
  .note{color:#8aa0b0;font-size:11px;margin:8px 0 0}
  footer{margin-top:26px;border-top:1px solid #d8e0e3;padding-top:8px;color:#8aa0b0;font-size:11px}
  @media print{body{background:#fff}.page{box-shadow:none;max-width:none}}
</style></head><body><div class="page">
  <header>
    <h1>PERSEUS Forest Intelligence — Area Report</h1>
    <div class="meta">${esc(name||"Area of interest")} · generated ${esc(today)}</div>
  </header>
  ${html}${radar}${attrs}${owners}${land}${stump}${outlook}${modelSec}
  <footer>
    Center for Research on Sustainable Forests · Center for Advanced Forestry Systems · PERSEUS (USDA NIFA SAS).
    Sources: FIA plots, TreeMap 2022, yield_curves_by_l3, CONUS overlays. Habitat and biodiversity are indicative
    composites — refine with field inventory. Area is geodesic (Albers equal-area).
  </footer>
</div></body></html>`;
}

export function downloadReport(aoi, stumpage, system = "imperial", mm){
  const finish = (model) => {
    const html = buildReportHTML(aoi, stumpage, system, model);
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const tag = (aoi && aoi.l3code ? String(aoi.l3code).replace(/\./g,"_") : (aoi && aoi.state) || "aoi");
    a.download = `perseus_area_report_${tag}.html`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  if(mm && mm.metrics) finish(mm);
  else fetchModelSummary(aoi && aoi.state, mm && mm.bucket, mm && mm.year).then(finish).catch(()=>finish(null));
}

// Open the report in a new tab (better for print-to-PDF). Opens synchronously to
// avoid popup blocking, then fills in once the multi-model ensemble has loaded.
export function openReport(aoi, stumpage, system = "imperial", mm){
  const w = window.open("", "_blank");
  if(w) w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>PERSEUS Area Report</title></head><body style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#5e7180;padding:48px">Generating area report\u2026</body></html>');
  fetchModelSummary(aoi && aoi.state, mm && mm.bucket, mm && mm.year).then(model => {
    const html = buildReportHTML(aoi, stumpage, system, model);
    if(w){ w.document.open(); w.document.write(html); w.document.close(); }
    else downloadReport(aoi, stumpage, system, model);
  }).catch(() => {
    const html = buildReportHTML(aoi, stumpage, system, null);
    if(w){ w.document.open(); w.document.write(html); w.document.close(); }
  });
}
