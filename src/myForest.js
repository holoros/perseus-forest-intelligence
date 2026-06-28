// Landowner "My forest at a glance" report. A richer, print-ready one-pager built from the
// already-loaded data (health/priority, species, disturbance, mortality, stumpage), with
// inline-SVG visuals so it prints and saves to PDF cleanly. No external dependencies.

const esc = (x) => String(x == null ? "" : x).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
function vccLabel(v) { if (v == null) return "n/a"; if (v >= 42) return "higher"; if (v >= 34) return "moderate"; return "lower"; }
function vccColor(v) { if (v == null) return "#999"; if (v >= 42) return "#c85a5a"; if (v >= 34) return "#e08a1e"; return "#4f9d8a"; }

// Horizontal bar chart. items: [{label, value, color, valueLabel}].
function svgBars(items, opts = {}) {
  if (!items.length) return "";
  const W = opts.w || 460, rowH = 22, pad = 4, labelW = opts.labelW || 120;
  const max = opts.max || Math.max(...items.map(i => i.value), 1);
  const H = items.length * rowH + pad * 2, barX = labelW, barW = W - labelW - 52;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;font-family:Helvetica,Arial,sans-serif">`;
  items.forEach((it, i) => {
    const y = pad + i * rowH, w = Math.max(1, it.value / max * barW);
    s += `<text x="${labelW - 6}" y="${y + 14}" text-anchor="end" font-size="11" fill="#333">${esc(it.label)}</text>`;
    s += `<rect x="${barX}" y="${y + 4}" width="${barW}" height="13" rx="2" fill="#eee"/>`;
    s += `<rect x="${barX}" y="${y + 4}" width="${w.toFixed(1)}" height="13" rx="2" fill="${it.color || "#3a7d5d"}"/>`;
    s += `<text x="${barX + w + 5}" y="${y + 14}" font-size="11" fill="#444">${esc(it.valueLabel != null ? it.valueLabel : it.value)}</text>`;
  });
  return s + "</svg>";
}

// Species quadrant: x = climate vulnerability (VCC), y = biomass share. Upper-right = priority.
function svgQuadrant(sp) {
  const pts = sp.filter(s => s.vcc != null && s.share_pct != null);
  if (pts.length < 2) return "";
  const W = 460, H = 260, M = { l: 42, r: 78, t: 18, b: 38 };
  const vcs = pts.map(s => s.vcc), shs = pts.map(s => s.share_pct);
  const vlo = Math.max(16, Math.min(28, Math.min(...vcs)) - 2), vhi = Math.min(62, Math.max(44, Math.max(...vcs)) + 2);
  const smax = Math.max(...shs) * 1.18 || 1;
  const px = v => M.l + (v - vlo) / (vhi - vlo) * (W - M.l - M.r), py = sv => H - M.b - (sv / smax) * (H - M.t - M.b);
  const medX = px(32), modX = px(38);
  const lab = pts.map(s => ({ s, x: px(s.vcc), y: py(s.share_pct) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 13) lab[i].y = lab[i - 1].y + 13;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;font-family:Helvetica,Arial,sans-serif">`;
  s += `<rect x="${modX.toFixed(1)}" y="${M.t}" width="${((W - M.r) - modX).toFixed(1)}" height="${(H - M.b) - M.t}" fill="rgba(200,90,90,0.08)"/>`;
  s += `<line x1="${M.l}" y1="${H - M.b}" x2="${W - M.r}" y2="${H - M.b}" stroke="#bbb"/><line x1="${M.l}" y1="${M.t}" x2="${M.l}" y2="${H - M.b}" stroke="#bbb"/>`;
  s += `<line x1="${medX.toFixed(1)}" y1="${M.t}" x2="${medX.toFixed(1)}" y2="${H - M.b}" stroke="#999" stroke-dasharray="3 3"/>`;
  s += `<text x="${medX.toFixed(1)}" y="${M.t - 4}" text-anchor="middle" font-size="9" fill="#888">US median</text>`;
  s += `<text x="${W - M.r - 2}" y="${M.t + 9}" text-anchor="end" font-size="9" fill="#c0504d">abundant &amp; vulnerable</text>`;
  [vlo, (vlo + vhi) / 2, vhi].forEach(t => { s += `<text x="${px(t).toFixed(1)}" y="${H - M.b + 13}" text-anchor="middle" font-size="9" fill="#888">${Math.round(t)}</text>`; });
  [0, smax / 2, smax].forEach(t => { s += `<text x="${M.l - 4}" y="${(py(t) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#888">${Math.round(t)}%</text>`; });
  s += `<text x="${((M.l + W - M.r) / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#555">climate vulnerability &rarr;</text>`;
  s += `<text transform="translate(11 ${((M.t + H - M.b) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="10" fill="#555">biomass share &uarr;</text>`;
  lab.forEach(({ s: sp1, x, y }) => {
    const cy = py(sp1.share_pct), right = x > (M.l + (W - M.r)) * 0.62;
    const short = sp1.common.replace(/^eastern /, "e. ").replace(/^western /, "w. ").replace(/^northern /, "n. ").replace(/^southern /, "s. ");
    const txt = short.length > 13 ? short.slice(0, 12) + "…" : short;
    s += `<circle cx="${x.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="${vccColor(sp1.vcc)}" stroke="#fff" stroke-width="0.8"/>`;
    s += `<text x="${(right ? x - 6 : x + 6).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${right ? "end" : "start"}" font-size="10" fill="#333">${esc(txt)}</text>`;
  });
  return s + "</svg>";
}

export function openMyForestReport(state, stateName, hrr, detail, stumpageM3, aoi, hrrEco, econ) {
  const s = hrr && hrr.states && hrr.states[state];
  const dd = detail && detail.states && detail.states[state];
  if (!s) { alert("Forest summary data is still loading — try again in a moment."); return; }
  const nat = (hrr.national && hrr.national.priority_share_pct) || 11.8;
  const scen = (hrr.national && hrr.national.scenario_priority_share_pct) || {};
  const pri = s.priority_pct;
  const vs = pri > nat * 1.15 ? "higher than" : pri < nat * 0.85 ? "lower than" : "about the same as";
  const cmp = (v) => v > nat * 1.15 ? "higher than" : v < nat * 0.85 ? "lower than" : "about the same as";
  const maxStatePri = Math.max(...Object.values(hrr.states).map(x => x.priority_pct));
  const eco = aoi && aoi.l3code && hrrEco && hrrEco.ecoregions ? hrrEco.ecoregions[aoi.l3code] : null;
  const ftop = aoi && aoi.plotStats && aoi.plotStats.forestTypes && aoi.plotStats.forestTypes[0];
  const acres = aoi && aoi.area_m2 ? Math.round(aoi.area_m2 / 4046.8564224) : null;
  const sp = (dd && dd.top_species) || [];
  const watch = sp.filter(x => x.vcc != null && x.vcc >= 38 && x.share_pct >= 8).sort((a, b) => (b.vcc * b.share_pct) - (a.vcc * a.share_pct));
  const ag = (dd && dd.agents) || {};
  const mortPct = s.mort_frac_mean != null ? (s.mort_frac_mean * 100) : null;
  const mbf = stumpageM3 != null ? Math.round(stumpageM3 * 2.359737) : null;
  const date = new Date().toLocaleDateString();
  // confidence: health from plot count; price from the stumpage basis
  const np = s.n_plots || 0;
  const healthConf = np >= 3000 ? "high" : np >= 1000 ? "moderate" : "limited";
  const stB = econ && econ.basis ? econ.basis[state] : null;
  const stConf = stB === "measured" ? "measured market prices" : stB === "partial" ? "measured prices with saw or pulp imputed from the regional median" : "a regional estimate (no local price series)";
  const stDet = econ && econ.detail ? econ.detail[state] : null;
  const top3 = sp.slice(0, 3);
  const top3names = top3.map(x => esc(x.common)).join(", ");
  const top3share = top3.length ? Math.round(top3.reduce((a, b) => a + b.share_pct, 0)) : null;

  // ---- visuals ----
  const priBars = svgBars([
    { label: aoi && eco ? (aoi.l3name || "Your ecoregion") : stateName, value: aoi && eco ? eco.priority_pct : pri, color: "#c0504d", valueLabel: Math.round(aoi && eco ? eco.priority_pct : pri) + "%" },
    { label: stateName + " (state)", value: pri, color: "#d98a3c", valueLabel: Math.round(pri) + "%" },
    { label: "National average", value: nat, color: "#888", valueLabel: nat + "%" },
    { label: "Highest state", value: maxStatePri, color: "#bbb", valueLabel: Math.round(maxStatePri) + "%" },
  ], { max: maxStatePri * 1.12, labelW: 150 });
  const agentItems = [["Insects", ag.insect], ["Disease", ag.disease], ["Weather", ag.weather], ["Animals", ag.animal], ["Fire", ag.fire]]
    .filter(([, v]) => v > 0).map(([l, v]) => ({ label: l, value: v, color: "#8a6d3b", valueLabel: v.toFixed(1) + "%" }));
  const agentBars = svgBars(agentItems, { max: Math.max(...agentItems.map(i => i.value), 1) * 1.15, labelW: 70, w: 400 });
  const quad = svgQuadrant(sp);

  const aoiBlock = aoi ? `
<h2>Your area</h2>
<p>${acres ? `About <b>${acres.toLocaleString()} acres</b> ` : ""}near <b>${aoi.centroid ? aoi.centroid[1].toFixed(3) + "&deg;, " + aoi.centroid[0].toFixed(3) + "&deg;" : ""}</b>${aoi.l3name ? `, in the <b>${esc(aoi.l3name)}</b> ecoregion of ${esc(stateName)}` : `, ${esc(stateName)}`}.${ftop ? ` The most common forest type here is <b>${esc(ftop.name || ftop)}</b>${ftop.share_pct ? ` (${Math.round(ftop.share_pct)}% of plots)` : ""}.` : ""}</p>
${eco ? `<p><b>Ecoregion context.</b> Across the ${esc(aoi.l3name || "local")} ecoregion, <b>${Math.round(eco.priority_pct)}%</b> of forest is priority area (high stress, low resilience) &mdash; <b>${cmp(eco.priority_pct)}</b> the national average of ${nat}%. This is the backdrop your stand sits in.</p>` : ""}` : "";

  const speciesRows = sp.slice(0, 6).map(x =>
    `<tr><td>${esc(x.common)}</td><td style="text-align:right">${Math.round(x.share_pct)}%</td><td style="text-align:right"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${vccColor(x.vcc)};margin-right:5px"></span>${x.vcc == null ? "&ndash;" : Math.round(x.vcc)} (${vccLabel(x.vcc)})</td></tr>`).join("");

  const actions = [];
  if (pri > nat) actions.push("Your forest carries an above-average share of stressed, low-resilience area. A stand health assessment with a licensed forester is a sensible first step.");
  if (watch.length) actions.push(`Your most abundant climate-vulnerable species ${watch.length > 1 ? "are" : "is"} <b>${watch.map(w => esc(w.common)).join(", ")}</b>. Favor regenerating and retaining lower-vulnerability species and avoid leaning further on the vulnerable ones.`);
  if ((ag.disturbed_pct || 0) > 10) actions.push(`Recent disturbance has touched ${Math.round(ag.disturbed_pct)}% of plots in your area. Watch the leading agents and plan salvage or sanitation only where warranted.`);
  if (mortPct != null && mortPct > 1.2) actions.push(`Measured tree mortality here (${mortPct.toFixed(1)}%/yr) is on the higher side; track standing-dead and consider a cut that captures value before further loss.`);
  actions.push("Maintain a mix of species, sizes, and ages. Diversity is the cheapest insurance against climate and pest risk.");
  if (mbf) actions.push(`If you are weighing a harvest, recent blended stumpage in ${esc(stateName)} runs about <b>$${mbf}/MBF</b> ($${Math.round(stumpageM3)}/m³); a forester can tell you whether your stand is at a value-maximizing age.`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>My forest — ${esc(stateName)}</title>
<style>
 body{font-family:Georgia,serif;max-width:760px;margin:28px auto;padding:0 18px;color:#1a1a1a;line-height:1.5}
 h1{font-size:23px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin-bottom:14px}
 h2{font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px;margin:20px 0 8px}
 .big{font-size:30px;font-weight:700;line-height:1} .big small{font-size:13px;font-weight:400;color:#555}
 table{border-collapse:collapse;width:100%;font-size:12.5px;margin:4px 0} th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}
 th{background:#f4f4f4} ul{margin:6px 0;padding-left:20px} li{margin:5px 0;font-size:13px}
 .muted{color:#666;font-size:11px;margin-top:18px} .pill{display:inline-block;background:#eef5f0;color:#2e6b4f;border-radius:10px;padding:1px 9px;font-size:11px}
 .fig{margin:8px 0 4px} .cap{font-size:10.5px;color:#777;margin:0 0 4px}
 .grid2{display:flex;gap:18px;flex-wrap:wrap} .grid2>div{flex:1;min-width:230px}
 .stat{display:inline-block;margin-right:18px;font-size:12.5px} .stat b{font-size:15px}
 @media print{body{margin:0} h2{page-break-after:avoid}}
</style></head><body>
<h1>Your forest at a glance${aoi ? "" : ` — ${esc(stateName)}`}</h1>
<div class="sub">PERSEUS Forest Intelligence &middot; ${date}${aoi ? ` &middot; ${esc(aoi.l3name || stateName)}, ${esc(stateName)}` : ` &middot; based on ${s.n_plots ? s.n_plots.toLocaleString() : ""} FIA plots in ${esc(stateName)}`}</div>
${aoiBlock}

<h2>${aoi ? `${esc(stateName)} — state context` : "Health"}</h2>
<p><span class="big">${Math.round(pri)}%<small> of ${esc(stateName)}'s forest is priority area</small></span></p>
<div class="fig">${priBars}</div>
<p class="cap">Priority area = forest both highly stressed and low in resilience. ${esc(stateName)} is <b>${vs}</b> the national average.</p>
<p>
 <span class="stat">Stress <b>${s.stress_mean != null ? s.stress_mean.toFixed(2) : "–"}</b><span class="muted" style="margin:0"> /1</span></span>
 <span class="stat">Resilience <b>${s.resil_mean != null ? s.resil_mean.toFixed(2) : "–"}</b><span class="muted" style="margin:0"> /1</span></span>
 ${mortPct != null ? `<span class="stat">Measured mortality <b>${mortPct.toFixed(1)}%</b>/yr</span>` : ""}
 <span class="stat">Sample <b>${s.n_plots ? s.n_plots.toLocaleString() : "–"}</b> plots</span>
</p>
${scen.current != null ? `<p class="cap">Looking ahead: under warming, the national priority share rises from about ${Math.round(scen.current)}% today toward ${scen.rcp45 != null ? Math.round(scen.rcp45) + "% (RCP4.5)" : ""}${scen.rcp85 != null ? ` and ${Math.round(scen.rcp85)}% (RCP8.5)` : ""}. Your area's relative standing is more stable than the absolute number.</p>` : ""}

<p class="cap"><b>How confident is this?</b> Health, species, and mortality come from <b>${np ? np.toLocaleString() : "the available"}</b> FIA plots (<b>${healthConf}</b> confidence). The stumpage value is ${stConf}${stDet && stDet.n_min ? `, based on roughly ${stDet.n_min} recent transactions` : ""}. These are estimates to start a conversation, not an appraisal or a stand exam of your specific land.</p>

<h2>Your species and their climate vulnerability</h2>
${quad ? `<div class="fig">${quad}</div><p class="cap">Each dot is a species placed by its climate vulnerability (x) and share of your biomass (y). The shaded upper-right is abundant <i>and</i> vulnerable — the species to act on first. Color: <span style="color:#4f9d8a">&#9679; lower</span> <span style="color:#e08a1e">&#9679; moderate</span> <span style="color:#c85a5a">&#9679; higher</span> (US median ≈ 32).</p>` : ""}
<table><thead><tr><th>Species (by biomass)</th><th style="text-align:right">Share</th><th style="text-align:right">Vulnerability (VCC)</th></tr></thead><tbody>${speciesRows || '<tr><td colspan="3">Species detail not available for this area.</td></tr>'}</tbody></table>
${watch.length ? `<p><span class="pill">watch list</span> ${watch.map(w => esc(w.common)).join(", ")} ${watch.length > 1 ? "are" : "is"} both abundant and climate-vulnerable here.</p>` : ""}

<h2>Forest conditions</h2>
<p>Measured from <b>${np ? np.toLocaleString() : "the available"}</b> FIA plots, your forest is led by <b>${top3names || "mixed species"}</b>${top3share != null ? ` (about ${top3share}% of biomass)` : ""}.${aoi && ftop ? ` Locally the most common forest type is <b>${esc(ftop.name || ftop)}</b>.` : ""} The figures below describe its current health and recent change.</p>
<div class="grid2">
 <div>${agentBars ? `<div class="fig">${agentBars}</div><p class="cap">Share of plots showing each disturbance agent.</p>` : `<p>${ag.disturbed_pct != null ? `About ${Math.round(ag.disturbed_pct)}% of plots show recent disturbance.` : "Disturbance detail not available."}</p>`}</div>
 <div>
  <p>${ag.disturbed_pct != null ? `<b>${Math.round(ag.disturbed_pct)}%</b> of forest plots show recent disturbance.` : ""}
  ${mortPct != null ? ` Measured annual tree mortality averages <b>${mortPct.toFixed(1)}%</b> of biomass per year (FIA growth-removal-mortality).` : ""}
  ${dd && dd.dead_live_pct != null ? ` Standing dead is about <b>${Math.round(dd.dead_live_pct)}%</b> of live biomass.` : ""}</p>
 </div>
</div>

<h2>What you might do</h2>
<ul>${actions.map(a => `<li>${a}</li>`).join("")}</ul>

<p class="muted">This summary is a starting point for conversation, not management or financial advice. Health, vulnerability, and mortality come from FIA plots, the Potter (2017) species climate-sensitivity scores, and measured FIA growth-removal-mortality; stumpage is a recent state blended average. For decisions on your land, work with a licensed forester. Generated by PERSEUS Forest Intelligence (holoros.github.io/perseus-forest-intelligence).</p>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
  else {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `my_forest_${state}.html`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
}
