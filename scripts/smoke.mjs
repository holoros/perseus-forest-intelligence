// PERSEUS deploy smoke test. Runs against a live (or preview) base URL and asserts the
// data contract and key render-safety markers, catching the regressions that have actually
// bitten us: missing/404 API data and a chart bundle that lost its plot clipPath (which let
// lines draw outside the axes). Run: `node scripts/smoke.mjs [baseURL]`.
// Full render-geometry checks (line endpoints inside the plot box) need a headless browser
// (Playwright) in CI; this script covers contract + markers without a browser.

const BASE = (process.argv[2] || "https://holoros.github.io/perseus-forest-intelligence/").replace(/\/?$/, "/");
const fails = [];
const ok = (cond, msg) => { if(!cond){ fails.push(msg); console.error("FAIL " + msg); } else console.log("pass " + msg); };

async function getText(url){ const r = await fetch(url); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); }
async function getJson(url){ const r = await fetch(url); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }

// 1. index.html loads and references a hashed JS bundle.
let bundleUrl = null;
try {
  const html = await getText(BASE);
  const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  ok(!!m, "index.html references a JS bundle");
  if(m) bundleUrl = BASE + "assets/" + m[1];
} catch(e){ ok(false, "index.html fetch: " + e.message); }

// 2. The bundle carries the chart plot clipPath marker (lines stay inside the axes).
if(bundleUrl){
  try {
    const js = await getText(bundleUrl);
    ok(js.includes("gc-plot"), "chart bundle contains the GrowthChart plot clipPath (gc-plot)");
    ok(js.includes("maxWidth:880") || js.includes("maxWidth: 880"), "chart bundle caps chart width");
  } catch(e){ ok(false, "bundle fetch: " + e.message); }
}

// 3. Core API data contracts fetch and parse with expected shape.
const checks = [
  ["api/hrr_states.json",   d => d.states && Object.keys(d.states).length >= 40, "hrr_states has >=40 states"],
  ["api/hrr_county.json",   d => (d.schema||"").includes("v6") && d.counties, "hrr_county is v6 with counties"],
  ["api/hrr_landowner.json",d => d.landowners && Object.keys(d.landowners).length >= 4, "hrr_landowner has >=4 ownership classes"],
  ["api/econ_params.json",  d => d.stumpage_usd_m3 && Object.keys(d.stumpage_usd_m3).length >= 48, "econ_params covers >=48 states"],
  ["api/yield_curves_by_l3.json", d => d.l3 && Object.keys(d.l3).length > 10, "yield curves present for many L3 ecoregions"],
  ["api/multimodel_anchored_trajectories.json", d => Object.keys(d).length >= 40, "multimodel trajectories cover >=40 states"],
];
for(const [path, test, label] of checks){
  try { const d = await getJson(BASE + path); ok(test(d), label); }
  catch(e){ ok(false, label + " (" + e.message + ")"); }
}

if(fails.length){ console.error(`\nSMOKE FAILED: ${fails.length} check(s).`); process.exit(1); }
console.log("\nSMOKE OK: all checks passed.");
