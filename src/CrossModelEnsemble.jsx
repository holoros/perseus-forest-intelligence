// Cross-model ensemble tab. Renders the harmonized multi-model trajectories from
// api/multimodel_anchored_trajectories.json: every engine (CBM, CEM, FVS default
// and calibrated, yield curve, and LANDIS where native runs exist) anchored to a
// shared 2025 FIA baseline, so the spread between lines is genuine model
// divergence rather than baseline mismatch. The ensemble band is the cross-model
// 90% range (mean +/- 1.645 * between-model SD). A 2100 summary table is pulled
// from api/multimodel_state_summary.json. Reuses the dependency-free MiniChart.
import { useState, useEffect } from "react";
import MiniChart from "./MiniChart.jsx";

const MCOL = {
  CBM:"#6baed6", CEM:"#d95f02", FVS_default:"#3fb68b", FVS_calibrated:"#1b9e77",
  YC:"#e6ab02", LANDIS:"#8856a7",
  CBM_disturbed:"#9ecae1", CEM_disturbed:"#fdae6b",
};
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
    color: MCOL[m] || "#999",
    pts: (node[m] || []).map(([y, v]) => [y, null, v, null]),  // bare line
  }));
  const ens = node._ensemble;
  if(ens && ens.pts){
    const idx = {}; (ens.cols || []).forEach((c, i) => { idx[c] = i; });
    series.push({
      label: "ensemble (90% band)", color: "#8a93a0",
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
        <MiniChart series={series} unit="AGC (TgC, anchored)" xlabel="Year"/>
      </div>

      {tableRows.length > 0 && (
        <div className="chartcard" style={{padding:"6px 8px", marginTop:8}}>
          <table style={{width:"100%", fontSize:12, borderCollapse:"collapse"}}>
            <thead>
              <tr style={{color:"var(--mut)", textAlign:"right"}}>
                <th style={{textAlign:"left"}}>Model</th><th>2100 carbon (TgC)</th><th>NPV @3%</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(r => (
                <tr key={r.name} style={{textAlign:"right"}}>
                  <td style={{textAlign:"left", color: MCOL[r.name] || MCOL[r.name?.replace("_def","_default").replace("_cal","_calibrated")] || "inherit"}}>{r.name}</td>
                  <td>{r.total != null ? r.total.toLocaleString() : "—"}</td>
                  <td>{r.npv != null ? r.npv.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="note" style={{marginTop:6}}>
        LANDIS is shown where native LANDIS-II runs exist (9 states: IN, ME, MI, MN, NH, OH,
        VT, WA, WI). Other states show CBM, CEM, FVS (default and calibrated), and the
        yield-curve engine. The band is the cross-model 90% range (mean ± 1.645 × between-model SD).
      </div>
    </div>
  );
}
