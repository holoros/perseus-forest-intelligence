// Landowner "my forest" one-page summary. Plain-language, print-ready HTML built from the
// already-loaded state data (health/priority, species, disturbance, stumpage value). Opens in
// a new window so the owner can read, save, or print to PDF. No dependencies.

function vccLabel(v){ if(v==null) return "n/a"; if(v>=42) return "higher"; if(v>=34) return "moderate"; return "lower"; }

export function openMyForestReport(state, stateName, hrr, detail, stumpageM3){
  const s = hrr && hrr.states && hrr.states[state];
  const dd = detail && detail.states && detail.states[state];
  if(!s){ alert("Forest summary data is still loading — try again in a moment."); return; }
  const esc = (x)=>String(x).replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
  const nat = (hrr.national && hrr.national.priority_share_pct) || 11.8;
  const pri = s.priority_pct;
  const vs = pri > nat*1.15 ? "higher than" : pri < nat*0.85 ? "lower than" : "about the same as";
  const sp = (dd && dd.top_species) || [];
  // Watch-list: abundant AND at least moderately vulnerable.
  const watch = sp.filter(x=>x.vcc!=null && x.vcc>=38 && x.share_pct>=8)
                  .sort((a,b)=>(b.vcc*b.share_pct)-(a.vcc*a.share_pct));
  const ag = (dd && dd.agents) || {};
  const agentList = [["insects",ag.insect],["disease",ag.disease],["weather",ag.weather],
                     ["animals",ag.animal],["fire",ag.fire]].filter(([,v])=>v>0)
                     .sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ${v.toFixed(0)}%`).join(", ");
  const mbf = stumpageM3!=null ? Math.round(stumpageM3*2.359737) : null; // $/m3 -> $/MBF
  const date = new Date().toLocaleDateString();

  const speciesRows = sp.slice(0,6).map(x=>
    `<tr><td>${esc(x.common)}</td><td style="text-align:right">${Math.round(x.share_pct)}%</td><td style="text-align:right">${x.vcc==null?"&ndash;":Math.round(x.vcc)} (${vccLabel(x.vcc)})</td></tr>`).join("");

  const actions = [];
  if(pri > nat) actions.push("Your forest carries an above-average share of stressed, low-resilience area. A stand health assessment with a licensed forester is a sensible first step.");
  if(watch.length) actions.push(`Your most abundant climate-vulnerable species ${watch.length>1?"are":"is"} ${watch.map(w=>esc(w.common)).join(", ")}. Favor regenerating and retaining lower-vulnerability species and avoid leaning further on the vulnerable ones.`);
  if((ag.disturbed_pct||0) > 10) actions.push(`Recent disturbance has touched ${Math.round(ag.disturbed_pct)}% of plots in your area (${agentList}). Watch these agents and plan salvage or sanitation only where warranted.`);
  actions.push("Maintain a mix of species, sizes, and ages. Diversity is the cheapest insurance against climate and pest risk.");
  if(mbf) actions.push(`If you are weighing a harvest, current sawtimber stumpage in ${esc(stateName)} runs about $${mbf}/MBF; a forester can tell you whether your stand is at a value-maximizing age.`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>My forest — ${esc(stateName)}</title>
<style>
 body{font-family:Georgia,serif;max-width:720px;margin:30px auto;padding:0 18px;color:#1a1a1a;line-height:1.5}
 h1{font-size:22px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin-bottom:16px}
 h2{font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px;margin:20px 0 8px}
 .big{font-size:30px;font-weight:700;line-height:1} .big small{font-size:13px;font-weight:400;color:#555}
 table{border-collapse:collapse;width:100%;font-size:12.5px;margin:4px 0} th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}
 th{background:#f4f4f4} ul{margin:6px 0;padding-left:20px} li{margin:4px 0;font-size:13px}
 .muted{color:#666;font-size:11px;margin-top:18px} .pill{display:inline-block;background:#eef5f0;color:#2e6b4f;border-radius:10px;padding:1px 9px;font-size:11px}
 @media print{body{margin:0}}
</style></head><body>
<h1>Your forest at a glance — ${esc(stateName)}</h1>
<div class="sub">PERSEUS Forest Intelligence &middot; ${date} &middot; based on ${s.n_plots? s.n_plots.toLocaleString():""} FIA plots in ${esc(stateName)}</div>

<h2>Health</h2>
<p><span class="big">${Math.round(pri)}%<small> of ${esc(stateName)}'s forest is priority area</small></span></p>
<p>Priority area is forest that is both highly stressed (climate exposure, sensitivity, recent disturbance) and low in resilience (younger, less stocked). At ${Math.round(pri)}%, ${esc(stateName)} is <b>${vs}</b> the national average of ${nat}%.</p>

<h2>Your species and their climate vulnerability</h2>
<table><thead><tr><th>Species (by biomass)</th><th style="text-align:right">Share</th><th style="text-align:right">Vulnerability</th></tr></thead><tbody>${speciesRows||'<tr><td colspan="3">Species detail not available for this area.</td></tr>'}</tbody></table>
${watch.length?`<p><span class="pill">watch list</span> ${watch.map(w=>esc(w.common)).join(", ")} ${watch.length>1?"are":"is"} both abundant and climate-vulnerable here.</p>`:""}

<h2>Recent disturbance</h2>
<p>${ag.disturbed_pct!=null?`About ${Math.round(ag.disturbed_pct)}% of forest plots show recent disturbance${agentList?` (${agentList})`:""}.`:"Disturbance detail not available for this area."}</p>

<h2>What you might do</h2>
<ul>${actions.map(a=>`<li>${a}</li>`).join("")}</ul>

<p class="muted">This summary is a starting point for conversation, not management or financial advice. Health and vulnerability come from FIA plots and the Potter (2017) species climate-sensitivity scores; stumpage is a recent state blended average. For decisions on your land, work with a licensed forester. Generated by PERSEUS Forest Intelligence (holoros.github.io/perseus-forest-intelligence).</p>
</body></html>`;

  const w = window.open("", "_blank");
  if(w){ w.document.write(html); w.document.close(); }
  else { // popup blocked: download instead
    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`my_forest_${state}.html`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
}
