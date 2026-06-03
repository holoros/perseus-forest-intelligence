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
const fmtArea = (m2) => { if(!m2) return "—"; const ac=m2/4046.8564224, ha=m2/1e4;
  return `${Math.round(ac).toLocaleString()} ac (${Math.round(ha).toLocaleString()} ha)`; };
const num = (v,d=0) => v==null?"—":Number(v).toLocaleString(undefined,{maximumFractionDigits:d});

function buildReportHTML(aoi, stumpage){
  const { name, l3code, l3name, l1, centroid, area_m2, state, plotStats, landscape, allCurves } = aoi || {};
  const today = new Date().toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
  const ps = plotStats, ls = landscape || {};

  const row = (k,v) => `<tr><td class="k">${esc(k)}</td><td class="v">${v}</td></tr>`;
  const bar = (label, pct, color) => `<div class="bar"><span class="bl">${esc(label)}</span>
    <span class="bt"><i style="width:${Math.max(0,Math.min(100,pct))}%;background:${color}"></i></span>
    <span class="bp">${Math.round(pct)}%</span></div>`;

  // ---- identity ----
  let html = `<table class="kv">`;
  if(area_m2) html += row("Area", fmtArea(area_m2));
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
    if(ps.meanBA!=null) attrs += row("Mean live basal area", `${num(ps.meanBA)} sq ft/ac`);
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
    if(s.sawSW!=null) r.push(row("Sawlog · softwood", `$${num(s.sawSW)}/MBF`));
    if(s.sawHW!=null) r.push(row("Sawlog · hardwood", `$${num(s.sawHW)}/MBF`));
    if(s.pulpSW!=null) r.push(row("Pulpwood · softwood", `$${num(s.pulpSW)}/cord`));
    if(s.pulpHW!=null) r.push(row("Pulpwood · hardwood", `$${num(s.pulpHW)}/cord`));
    if(r.length) stump = `<h2>Stumpage prices${state?` · ${esc(state)}`:""}</h2><table class="kv">${r.join("")}</table>`;
  }

  // ---- management outlook (untreated vs harvested AGB) ----
  let outlook = "";
  const agb = allCurves && allCurves.agb_tonac;
  if(agb && agb.untreated && agb.harvested){
    const ages=[5,25,50,75,100];
    const cells = a => `<td>${num(interp(agb.untreated,a))}</td><td>${num(interp(agb.harvested,a))}</td>`;
    outlook = `<h2>Management outlook <span class="sub">above-ground biomass, ton/ac</span></h2>
      <table class="proj"><thead><tr><th>Stand age (yr)</th>${ages.map(a=>`<th colspan=2>${a}</th>`).join("")}</tr>
      <tr><th></th>${ages.map(()=>`<th>reserve</th><th>managed</th>`).join("")}</tr></thead>
      <tbody><tr><td>AGB (ton/ac)</td>${ages.map(cells).join("")}</tr></tbody></table>
      <p class="note">Reserve = unharvested trajectory; managed = working-forest (harvest) trajectory, both from the ycX yield curves for the encompassing ecoregion.</p>`;
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
  ${html}${attrs}${owners}${land}${stump}${outlook}
  <footer>
    Center for Research on Sustainable Forests · Center for Advanced Forestry Systems · PERSEUS (USDA NIFA SAS).
    Sources: FIA plots, TreeMap 2022, yield_curves_by_l3, CONUS overlays. Habitat and biodiversity are indicative
    composites — refine with field inventory. Area is geodesic (Albers equal-area).
  </footer>
</div></body></html>`;
}

export function downloadReport(aoi, stumpage){
  const html = buildReportHTML(aoi, stumpage);
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const tag = (aoi && aoi.l3code ? String(aoi.l3code).replace(/\./g,"_") : (aoi && aoi.state) || "aoi");
  a.download = `perseus_area_report_${tag}.html`;
  a.click(); URL.revokeObjectURL(a.href);
}

// Open the report in a new tab (better for print-to-PDF).
export function openReport(aoi, stumpage){
  const html = buildReportHTML(aoi, stumpage);
  const w = window.open("", "_blank");
  if(w){ w.document.write(html); w.document.close(); }
  else downloadReport(aoi, stumpage);
}
