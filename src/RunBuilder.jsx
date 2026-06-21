// Run builder: the on-demand flow. Select an area, choose models, build scenarios,
// and submit. Free tier resolves the multi-model ensemble instantly from the
// precomputed PERSEUS series (client-side port of cardinal/run_scenario.py);
// the same run-spec is what dispatches to Cardinal for a subscriber custom run.
import { useState } from "react";

const STATES = ["AK","AL","AR","AZ","CA","CO","CT","DE","FL","GA","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY"];
const MODELS = [["fvs","FVS","FVS"],["cbm","CBM","CBM"],["cem","CEM","CEM"],["yield","Yield curves","YC"],["landis","LANDIS","LANDIS"]];
const CLS_COL = { FVS:"#3a6ea5", CBM:"#8a5cd1", CEM:"#d98a3c", YC:"#2e9e6b", LANDIS:"#c0504d" };
const MGMTS = [["reserve","Reserve (no harvest)","reserve (no harvest)"],
               ["baseline","Managed (harvest)","managed (harvest)"],
               ["intensive","Managed (intensive)","managed (intensive)"],
               ["conservation","Managed (conservation)","managed (conservation)"],
               ["extensive","Managed (extensive)","managed (extensive)"]];
const CLIMATES = [["historic","Historic"],["baseline_2020","2020 baseline"],["rcp45","RCP4.5"],["rcp85","RCP8.5"]];
const METRICS = [["agc_live_total","Carbon, live (t/ac)"],["merch_vol_mcf","Merch. volume (MCF)"],
                 ["standing_value_musd","Standing value ($M)"],["es_bundle_score","Ecosystem-service score"],
                 ["mean_stand_age","Mean stand age (yr)"],["total_ecosystem_c","Total ecosystem C"]];
const fmt = (v, d=1) => (v==null||isNaN(v) ? "–" : Number(v).toLocaleString(undefined,{maximumFractionDigits:d}));

function MultiLineChart({ rows }) {
  // rows: [{model,cls,pts:[[yr,val]]}]
  if (!rows.length) return <div className="note">No model output for this scenario.</div>;
  const W=360,H=180,m={l:42,r:10,t:10,b:22};
  const xs=rows.flatMap(r=>r.pts.map(p=>p[0])), ys=rows.flatMap(r=>r.pts.map(p=>p[1]));
  const x0=Math.min(...xs),x1=Math.max(...xs),y1=Math.max(...ys,1)*1.05,y0=Math.min(...ys,0);
  const px=v=>m.l+(v-x0)/((x1-x0)||1)*(W-m.l-m.r), py=v=>(H-m.b)-(v-y0)/((y1-y0)||1)*(H-m.t-m.b);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{fontSize:9,fontVariantNumeric:"tabular-nums"}}>
      <line x1={m.l} y1={H-m.b} x2={W-m.r} y2={H-m.b} stroke="var(--line,#345)" strokeWidth={0.6}/>
      <line x1={m.l} y1={m.t} x2={m.l} y2={H-m.b} stroke="var(--line,#345)" strokeWidth={0.6}/>
      {[y0,(y0+y1)/2,y1].map((t,i)=><text key={i} x={m.l-4} y={py(t)+3} textAnchor="end" fill="var(--mut,#8a93a0)">{fmt(t,0)}</text>)}
      {[x0,Math.round((x0+x1)/2),x1].map((t,i)=><text key={i} x={px(t)} y={H-m.b+13} textAnchor="middle" fill="var(--mut,#8a93a0)">{t}</text>)}
      {rows.map((r,i)=>(
        <polyline key={i} points={r.pts.map(p=>`${px(p[0])},${py(p[1])}`).join(" ")} fill="none"
          stroke={CLS_COL[r.cls]||"#888"} strokeWidth={1.5} opacity={0.85}/>
      ))}
    </svg>
  );
}

export default function RunBuilder() {
  const [st, setSt] = useState("ME");
  const [models, setModels] = useState({ fvs:true, cbm:true, cem:true, yield:true, landis:false });
  const [metric, setMetric] = useState("agc_live_total");
  const [scenarios, setScenarios] = useState([{ mgmt:"reserve", climate:"historic" }, { mgmt:"baseline", climate:"historic" }]);
  const [run, setRun] = useState(null); // {spec, results, status}
  const [busy, setBusy] = useState(false);

  const selModels = MODELS.filter(([k]) => models[k]);
  const spec = {
    spec_version: "1.0",
    aoi: { type: "inventory", state: st, scale: "ownership" },
    models: selModels.map(([k]) => k),
    assumptions: {
      management: [...new Set(scenarios.map(s => s.mgmt))],
      climate: [...new Set(scenarios.map(s => s.climate))],
      horizon_year: 2100,
    },
    outputs: [metric],
    tier: "subscriber",
  };

  async function submit() {
    setBusy(true); setRun(null);
    try {
      const base = import.meta.env.BASE_URL || "/";
      const res = await fetch(`${base}api/series/${st}.json`);
      if (!res.ok) throw new Error("no data");
      const series = await res.json();
      const node = series[metric] || {};
      const results = scenarios.map((sc) => {
        const label = (MGMTS.find(([k]) => k === sc.mgmt) || [])[2];
        const entries = node[label] || [];
        const engines = selModels.map(([mk, , cls]) => {
          let ms = entries.filter((e) => e.cls === cls);
          if (sc.climate !== "historic") {
            const cf = ms.filter((e) => (e.model || "").toLowerCase().includes(sc.climate));
            if (cf.length) ms = cf;
          }
          return { mk, cls, rows: ms.map((e) => ({ model: e.model, cls: e.cls, pts: e.pts.map((p) => [p[0], p[1]]) })) };
        });
        return { sc, label, engines };
      });
      setRun({ spec, results, status: "complete" });
    } catch (e) {
      setRun({ spec, results: null, status: "no_data" });
    }
    setBusy(false);
  }

  const setScn = (i, key, val) => setScenarios((s) => s.map((r, j) => j === i ? { ...r, [key]: val } : r));
  const addScn = () => setScenarios((s) => [...s, { mgmt: "intensive", climate: "rcp45" }]);
  const rmScn = (i) => setScenarios((s) => s.length > 1 ? s.filter((_, j) => j !== i) : s);
  const sel = { background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 6px", fontSize: 11 };
  const chip = (on, col) => ({ fontSize: 11, padding: "2px 9px", borderRadius: 4, cursor: "pointer", border: `1px solid ${on ? (col || "#3a6ea5") : "var(--bd,#345)"}`, background: on ? (col || "#3a6ea5") : "transparent", color: on ? "#fff" : "var(--fg,#cdd)" });

  return (
    <div>
      <div className="who" style={{ marginBottom: 6 }}>
        <b>Build a run</b> <span style={{ color: "var(--mut)" }}>· select an area, choose models, build scenarios, submit</span>
      </div>

      {/* 1. area */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>1 · Area of interest</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 11 }}>
          <span style={{ color: "var(--mut)" }}>State (ownership):</span>
          <select value={st} onChange={(e) => setSt(e.target.value)} style={sel}>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="note" style={{ marginTop: 4 }}>States are the precomputed unit here. A subscriber run takes a drawn AOI or uploaded inventory at any scale, crossing state lines, and resolves the same way.</div>
      </div>

      {/* 2. models */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>2 · Models</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MODELS.map(([k, lbl, cls]) => <span key={k} style={chip(models[k], CLS_COL[cls])} onClick={() => setModels((m) => ({ ...m, [k]: !m[k] }))}>{lbl}</span>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11, marginTop: 6 }}>
          <span style={{ color: "var(--mut)" }}>Output metric:</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} style={sel}>
            {METRICS.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
          </select>
        </div>
      </div>

      {/* 3. scenarios */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>3 · Scenarios (management × climate)</div>
        {scenarios.map((sc, i) => (
          <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: "var(--mut)", width: 14 }}>{i + 1}</span>
            <select value={sc.mgmt} onChange={(e) => setScn(i, "mgmt", e.target.value)} style={sel}>
              {MGMTS.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
            </select>
            <select value={sc.climate} onChange={(e) => setScn(i, "climate", e.target.value)} style={sel}>
              {CLIMATES.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
            </select>
            {scenarios.length > 1 && <span onClick={() => rmScn(i)} style={{ cursor: "pointer", color: "var(--mut)", fontWeight: 700 }}>×</span>}
          </div>
        ))}
        <span onClick={addScn} style={{ ...chip(false), display: "inline-block", marginTop: 2 }}>+ add scenario</span>
      </div>

      {/* 4. submit */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>4 · Submit</div>
        <button onClick={submit} disabled={busy || !selModels.length} className="mini-btn" style={{ borderStyle: "solid", fontSize: 12, padding: "4px 12px" }}>
          {busy ? "Running…" : "Run scenarios (free / precomputed)"}
        </button>
        <div className="note" style={{ marginTop: 4 }}>
          This resolves instantly from precomputed PERSEUS runs. The exact run-spec below is what a subscriber custom run dispatches to Cardinal (FVS, CBM, CEM, LANDIS executed on demand for your drawn AOI and inventory).
        </div>
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 11, color: "var(--mut)", cursor: "pointer" }}>view run-spec (the Cardinal contract)</summary>
          <pre style={{ fontSize: 10, overflow: "auto", background: "var(--panel)", padding: 8, borderRadius: 5, marginTop: 4 }}>{JSON.stringify(spec, null, 2)}</pre>
        </details>
      </div>

      {/* results */}
      {run && run.status === "no_data" && <div className="note" style={{ padding: 8 }}>No precomputed series for {st}. Try another state, or this would run live on Cardinal for a subscriber.</div>}
      {run && run.results && run.results.map((r, i) => {
        const allRows = r.engines.flatMap((e) => e.rows);
        const present = r.engines.filter((e) => e.rows.length);
        return (
          <div key={i} className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
              Scenario {i + 1}: {(MGMTS.find(([k]) => k === r.sc.mgmt) || [])[1]} · {(CLIMATES.find(([k]) => k === r.sc.climate) || [])[1]}
            </div>
            <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 2 }}>{METRICS.find(([k]) => k === metric)[1]} · {allRows.length} model runs across {present.length} engines</div>
            <MultiLineChart rows={allRows} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 10, marginTop: 2 }}>
              {present.map((e) => <span key={e.cls} style={{ color: CLS_COL[e.cls] }}>● {e.cls} ({e.rows.length})</span>)}
            </div>
          </div>
        );
      })}
      {run && run.results && (
        <div className="note" style={{ color: "var(--mut)" }}>
          Each line is one model run; spread between engines is the honest uncertainty. This is the ensemble a subscriber would get on demand for their exact area.
        </div>
      )}
    </div>
  );
}
