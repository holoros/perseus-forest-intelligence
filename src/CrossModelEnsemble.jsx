// Cross-model ensemble tab. Renders the harmonized multi-model trajectories from
// api/multimodel_anchored_trajectories.json: every engine (CBM, CEM, FVS default
// and calibrated, yield curve, and LANDIS where native runs exist) anchored to a
// shared 2025 FIA baseline, so the spread between lines is genuine model
// divergence rather than baseline mismatch. The ensemble band is the cross-model
// 90% range (mean +/- 1.645 * between-model SD). A 2100 summary table is pulled
// from api/multimodel_state_summary.json. Reuses the dependency-free MiniChart.
import { useState, useEffect } from "react";
import MiniChart from "./MiniChart.jsx";
import { fmtUnit } from "./units.js";

// Okabe-Ito engine-family colors (same family, same hue in every chart). Variants inside a
// family share the hue and differ by line style.
const MCOL = {
  CBM:"#0072B2", CEM:"#009E73", FVS_default:"#E69F00", FVS_calibrated:"#E69F00", FVS_gompit:"#E69F00",
  YC:"#CC79A7", YieldCurve:"#CC79A7", LANDIS:"#56B4E9",
  CBM_disturbed:"#0072B2", CEM_disturbed:"#009E73",
};
const MDASH = { FVS_default:"6 3", FVS_gompit:"1.5 2.5", CBM_disturbed:"6 3", CEM_disturbed:"6 3" };
const tableCol = name => MCOL[name] || MCOL[name?.replace("_def","_default").replace("_cal","_calibrated")] || "var(--context)";
const keys = o => (o && typeof o === "object") ? Object.keys(o) : [];

export default function CrossModelEnsemble({ traj, summary, state }){
  const st = traj && traj[state];
  const [scn, setScn] = useState("reserve");
  useEffect(()=>{ setScn("reserve"); },[state]);

  if(!traj) return <div className="empty">Cross-model ensemble not loaded.</div>;
  if(!st)   return <div className="empty">No anchored trajectories for {state}.</div>;

  const scns = keys(st);
  const sc = scns.includes(scn) ? scn : scns[0];
  const node = st[sc] || {};
  const modelKeys = keys(node).filter(k => k !== "_ensemble");

  const series = modelKeys.map(m => ({
    label: m,
    color: MCOL[m] || "var(--context)",
    dash: MDASH[m],
    pts: (node[m] || []).map(([y, v]) => [y, null, v, null]),  // bare line
  }));
  const ens = node._ensemble;
  if(ens && ens.pts){
    const idx = {}; (ens.cols || []).forEach((c, i) => { idx[c] = i; });
    series.push({
      label: "ensemble mean", color: "var(--ink-2)", width: 2.4, bandName: "cross-model 90% range",
      pts: ens.pts.map(r => [r[idx.year], r[idx.lo90], r[idx.mean], r[idx.hi90]]),
    });
  }

  const sm = summary && summary[state] && (summary[state].reserve || summary[state][Object.keys(summary[state])[0]]);
  const mods = sm && sm.models ? sm.models : null;
  const dmOf = m => ("nodisturb" in m) ? "nodisturb" : ("default" in m ? "default" : Object.keys(m)[0]);
  const tableRows = mods ? Object.keys(mods).map(name => {
    const r = mods[name][dmOf(mods[name])] || {};
    return { name, total: r.total_2100_TgC, npv: r["npv_0.03"] };
  }) : [];

  return (
    <div>
      <div className="controls" style={{marginTop:0}}>
        <select value={sc} onChange={e=>setScn(e.target.value)} title="Scenario">
          {scns.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="note" style={{marginLeft:8}}>
          Anchored to a shared 2025 FIA baseline; line spread = model divergence.
        </span>
      </div>

      <div className="chartcard" style={{padding:"6px 8px"}}>
        <MiniChart series={series} unit={`Aboveground carbon (${fmtUnit("Tg C")}), anchored to 2025 FIA`} xlabel="Year"/>
      </div>

      {tableRows.length > 0 && (
        <div className="chartcard" style={{padding:"6px 8px", marginTop:8}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Model</th><th>2100 carbon ({fmtUnit("Tg C")})</th><th>NPV at 3%</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(r => (
                <tr key={r.name}>
                  <td><i style={{display:"inline-block",width:8,height:8,borderRadius:"50%",marginRight:6,
                    verticalAlign:"middle",background:tableCol(r.name)}}/>{r.name}</td>
                  <td>{r.total != null ? r.total.toLocaleString() : "n/a"}</td>
                  <td>{r.npv != null ? r.npv.toLocaleString() : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="note" style={{marginTop:6}}>
        LANDIS is shown where native LANDIS-II runs exist (9 states: IN, ME, MI, MN, NH, OH,
        VT, WA, WI). Other states show CBM, CEM, FVS (default and calibrated), and the
        yield-curve engine. The shaded band is the cross-model 90% range (mean ± 1.645 × between-model SD).
        Variants within a family share its color: dashed FVS is the default variant, dotted FVS the gompit variant,
        and dashed CBM or CEM the disturbed scenario.
      </div>
    </div>
  );
}
