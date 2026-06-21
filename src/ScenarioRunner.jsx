// Scenario runner (prototype): the launch-vision front door — pick a place, a data
// source, models, and contrasting assumptions, and see projected outcomes. The free
// tier plots real precomputed per-L3 yield trajectories (reserve vs managed); the
// subscriber tier (chips) runs the full multi-model ensemble on demand for the
// user's exact area and data. Self-contained; uses yield_curves_by_l3.json.
import { useState } from "react";

const MGMT = [["reserve", "Reserve (no harvest)", "untreated", "#2e9e6b"],
              ["baseline", "Managed (harvest)", "harvested", "#d98a3c"]];
const METRICS = [["agb_tonac", "Above-ground biomass (ton/ac)"],
                 ["carbon_lbac", "Carbon (lb/ac)"],
                 ["voltot_cuftac", "Total volume (cu ft/ac)"]];
const MODELS = [["yield", "Yield curves", true], ["fvs", "FVS", false], ["cbm", "CBM", false],
                ["cem", "CEM", false], ["landis", "LANDIS", false]];
const SOURCES = [["fia", "FIA", true], ["treemap", "TreeMap", false], ["user", "Your inventory", false]];
const CLIMATE = [["historic", "Historic"], ["rcp45", "RCP4.5"], ["rcp85", "RCP8.5"]];
// Forward price paths (mirror cardinal/run_scenario.py; illustrative stumpage).
const PRICE_PATHS = {
  low:  { saw: 0.20, pulp: 0.03, carbon: 8,  label: "Low" },
  base: { saw: 0.35, pulp: 0.05, carbon: 15, label: "Base" },
  high: { saw: 0.55, pulp: 0.09, carbon: 30, label: "High" },
};
const SAW_FRACTION = 0.55, DISCOUNT = 0.04;
const fmt = (v, d = 0) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));
// Economics at the final curve age for one management series.
function econAt(node, curveKey, p) {
  const cm = node && node.curves || {};
  const merch = cm.merchvol_cuftac && cm.merchvol_cuftac[curveKey];
  const carb = cm.carbon_lbac && cm.carbon_lbac[curveKey];
  const blend = SAW_FRACTION * p.saw + (1 - SAW_FRACTION) * p.pulp;
  const out = {};
  if (merch && merch.length) {
    const [age, v] = merch[merch.length - 1];
    out.age = age; out.harvest = v * blend; out.npvH = (v * blend) / Math.pow(1 + DISCOUNT, age);
  }
  if (carb && carb.length) {
    const [age, lb] = carb[carb.length - 1];
    const cv = (lb / 2204.62) * (44 / 12) * p.carbon;
    out.age = out.age || age; out.carbon = cv; out.npvC = cv / Math.pow(1 + DISCOUNT, age);
  }
  return out;
}

export default function ScenarioRunner({ yields }) {
  const l3 = yields && yields.l3;
  const codes = l3 ? Object.keys(l3).sort((a, b) => l3[a].name.localeCompare(l3[b].name)) : [];
  const [code, setCode] = useState("");
  const [metric, setMetric] = useState("agb_tonac");
  const [mgmts, setMgmts] = useState({ reserve: true, baseline: true });
  const [climate, setClimate] = useState("historic");
  const [price, setPrice] = useState("base");
  const cur = code && l3 && l3[code];
  if (!l3) return <div className="empty">Scenario data loading…</div>;
  const cc = code || codes[0];
  const node = l3[cc];

  const toggle = (k) => setMgmts((m) => ({ ...m, [k]: !m[k] }));
  const series = MGMT.filter(([k]) => mgmts[k]).map(([k, lbl, curveKey, col]) => {
    const pts = node && node.curves && node.curves[metric] && node.curves[metric][curveKey];
    return { k, lbl, col, pts: pts || [] };
  }).filter((s) => s.pts.length);

  // chart geometry
  const W = 360, H = 200, m = { l: 40, r: 12, t: 12, b: 26 };
  const allx = series.flatMap((s) => s.pts.map((p) => p[0]));
  const ally = series.flatMap((s) => s.pts.map((p) => p[1]));
  const x0 = Math.min(...allx, 0), x1 = Math.max(...allx, 100);
  const y1 = Math.max(...ally, 1) * 1.08;
  const px = (v) => m.l + (v - x0) / ((x1 - x0) || 1) * (W - m.l - m.r);
  const py = (v) => (H - m.b) - v / (y1 || 1) * (H - m.t - m.b);

  const atEnd = (s) => s.pts.length ? s.pts[s.pts.length - 1][1] : null;
  const res = series.find((s) => s.k === "reserve"), bas = series.find((s) => s.k === "baseline");
  const takeaway = (res && bas && atEnd(res) != null && atEnd(bas) != null)
    ? `At age ${node.curves[metric].untreated.slice(-1)[0][0]}, leaving this stand unharvested holds about ${fmt(atEnd(res))} vs ${fmt(atEnd(bas))} under harvest (${METRICS.find(([k])=>k===metric)[1].toLowerCase()}). The gap is the carbon-vs-income trade-off to weigh.`
    : null;

  const p = PRICE_PATHS[price];
  const econRows = MGMT.filter(([k]) => mgmts[k]).map(([k, lbl, curveKey, col]) => ({ k, lbl, col, e: econAt(node, curveKey, p) }));

  const chip = (on, okCol) => ({ fontSize: 11, padding: "2px 9px", borderRadius: 4, cursor: "pointer",
    border: `1px solid ${on ? (okCol || "#3a6ea5") : "var(--bd,#345)"}`,
    background: on ? (okCol || "#3a6ea5") : "transparent", color: on ? "#fff" : "var(--fg,#cdd)" });

  return (
    <div>
      <div className="who" style={{ marginBottom: 6 }}>
        <b>Scenario runner</b> <span style={{ color: "var(--mut)" }}>· project outcomes for a place under contrasting assumptions</span>
      </div>

      {/* place + data source */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 11 }}>
          <span style={{ color: "var(--mut)" }}>Place (ecoregion):</span>
          <select value={cc} onChange={(e) => setCode(e.target.value)}
            style={{ background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 6px", fontSize: 11, maxWidth: 240 }}>
            {codes.map((c) => <option key={c} value={c}>{l3[c].name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11, marginTop: 6 }}>
          <span style={{ color: "var(--mut)" }}>Data source:</span>
          {SOURCES.map(([k, lbl, on]) => <span key={k} style={{ ...chip(k === "fia"), cursor: on ? "pointer" : "default", opacity: on ? 1 : 0.5 }} title={on ? "" : "subscriber / on-demand"}>{lbl}{!on ? " ◦" : ""}</span>)}
        </div>
      </div>

      {/* models */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>Models</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MODELS.map(([k, lbl, on]) => <span key={k} style={{ ...chip(k === "yield", on ? "#2e9e6b" : null), cursor: on ? "default" : "default", opacity: on ? 1 : 0.55 }}
            title={on ? "precomputed (free)" : "full multi-model run — subscriber / on-demand"}>{lbl}{!on ? " ◦" : ""}</span>)}
        </div>
        <div className="note" style={{ marginTop: 4 }}>Yield curves run instantly (free tier). FVS, CBM, CEM, LANDIS run on demand for subscribers (◦).</div>
      </div>

      {/* assumptions */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11, marginBottom: 6 }}>
          <span style={{ color: "var(--mut)" }}>Management:</span>
          {MGMT.map(([k, lbl, , col]) => <span key={k} style={chip(mgmts[k], col)} onClick={() => toggle(k)}>{lbl}</span>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11, marginBottom: 6 }}>
          <span style={{ color: "var(--mut)" }}>Climate:</span>
          {CLIMATE.map(([k, lbl]) => <span key={k} style={{ ...chip(climate === k), opacity: k === "historic" ? 1 : 0.6 }} onClick={() => setClimate(k)}
            title={k === "historic" ? "" : "calibrated climate scaling in progress (CEM run)"}>{lbl}{k !== "historic" ? " ◦" : ""}</span>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11, marginBottom: 6 }}>
          <span style={{ color: "var(--mut)" }}>Output:</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value)}
            style={{ background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 6px", fontSize: 11 }}>
            {METRICS.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11 }}>
          <span style={{ color: "var(--mut)" }}>Market prices:</span>
          {Object.entries(PRICE_PATHS).map(([k, v]) => <span key={k} style={chip(price === k)} onClick={() => setPrice(k)}>{v.label}</span>)}
          <span style={{ color: "var(--mut)" }}>· carbon ${p.carbon}/tCO2e</span>
        </div>
      </div>

      {/* chart */}
      <div className="chartcard" style={{ padding: "8px 10px" }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 2 }}>
          {node && node.name} · {METRICS.find(([k]) => k === metric)[1]} vs stand age{climate !== "historic" ? ` · ${climate} (climate scaling pending)` : ""}
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ fontSize: 9, fontVariantNumeric: "tabular-nums" }}>
          <line x1={m.l} y1={H - m.b} x2={W - m.r} y2={H - m.b} stroke="var(--line,#345)" strokeWidth={0.6} />
          <line x1={m.l} y1={m.t} x2={m.l} y2={H - m.b} stroke="var(--line,#345)" strokeWidth={0.6} />
          {[0, 0.5, 1].map((f, i) => <text key={i} x={m.l - 4} y={py(y1 * f) + 3} textAnchor="end" fill="var(--mut,#8a93a0)">{fmt(y1 * f)}</text>)}
          {[x0, (x0 + x1) / 2, x1].map((t, i) => <text key={i} x={px(t)} y={H - m.b + 14} textAnchor="middle" fill="var(--mut,#8a93a0)">{fmt(t)}</text>)}
          {series.map((s) => (
            <g key={s.k}>
              <polyline points={s.pts.map((p) => `${px(p[0])},${py(p[1])}`).join(" ")} fill="none" stroke={s.col} strokeWidth={2} />
              {s.pts.length ? <text x={px(s.pts[s.pts.length - 1][0])} y={py(s.pts[s.pts.length - 1][1]) - 4} textAnchor="end" fill={s.col} fontWeight={600}>{s.lbl.split(" ")[0]}</text> : null}
            </g>
          ))}
        </svg>
        {takeaway && <div className="note" style={{ marginTop: 4 }}>{takeaway}</div>}
        <div className="note" style={{ marginTop: 4, color: "var(--mut)" }}>
          Free: precomputed yield projections shown above. Subscriber: run the full ensemble (FVS, CBM, CEM, LANDIS) on demand for your exact area, your own inventory, and custom climate and management — at any scale.
        </div>
      </div>

      {/* economics: markets differentiator */}
      {econRows.length > 0 && (
        <div className="chartcard" style={{ padding: "8px 10px", marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>
            Economics at age {econRows[0].e.age || "horizon"} · {p.label} market · timber vs carbon ($/ac)
          </div>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: "var(--mut)", textAlign: "right" }}>
                <th style={{ textAlign: "left", fontWeight: 500 }}>Management</th>
                <th style={{ fontWeight: 500 }}>Timber value</th>
                <th style={{ fontWeight: 500 }}>Carbon value</th>
                <th style={{ fontWeight: 500 }}>NPV (timber)</th>
                <th style={{ fontWeight: 500 }}>NPV (carbon)</th>
              </tr>
            </thead>
            <tbody>
              {econRows.map((r) => (
                <tr key={r.k} style={{ textAlign: "right", borderTop: "1px solid var(--line,#345)" }}>
                  <td style={{ textAlign: "left", color: r.col, fontWeight: 600 }}>{r.lbl.split(" ")[0]}</td>
                  <td>${fmt(r.e.harvest)}</td>
                  <td>${fmt(r.e.carbon)}</td>
                  <td>${fmt(r.e.npvH)}</td>
                  <td>${fmt(r.e.npvC)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note" style={{ marginTop: 4 }}>
            Illustrative stumpage and carbon prices, 4% discount. The point is the trade-off: managed land earns timber revenue, reserved land builds carbon value. Which wins depends on the prices you assume — that is the decision the tool is built to inform.
          </div>
        </div>
      )}
    </div>
  );
}
