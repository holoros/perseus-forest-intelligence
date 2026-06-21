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
// Ecosystem-service payments (user-set $/ac/yr; intact forest delivers more, managed gets a fraction).
const ES_LEVELS = [["none", "None", 0], ["mod", "$5/ac/yr", 5], ["high", "$15/ac/yr", 15]];
const ES_MANAGED_FRAC = 0.5;
const annuity = (age, r) => (1 - Math.pow(1 + r, -age)) / r;
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

// Blend yield curves across multiple ecoregions (a multi-region / multi-state ownership).
const BLEND_CURVES = ["agb_tonac", "carbon_lbac", "voltot_cuftac", "merchvol_cuftac"];
const BLEND_SERIES = ["untreated", "harvested"];
function blendNode(nodes) {
  nodes = nodes.filter(Boolean);
  if (nodes.length <= 1) return nodes[0];
  const curves = {};
  for (const cn of BLEND_CURVES) {
    curves[cn] = {};
    for (const sv of BLEND_SERIES) {
      const arrs = nodes.map((n) => n.curves && n.curves[cn] && n.curves[cn][sv]).filter(Boolean);
      if (!arrs.length) continue;
      curves[cn][sv] = arrs[0].map((pt, i) => {
        const vals = arrs.map((a) => a[i] && a[i][1]).filter((v) => v != null && !isNaN(v));
        return [pt[0], vals.reduce((s, v) => s + v, 0) / (vals.length || 1)];
      });
    }
  }
  return { name: nodes.length + " ecoregions (blended)", curves };
}

export default function ScenarioRunner({ yields }) {
  const l3 = yields && yields.l3;
  const codes = l3 ? Object.keys(l3).sort((a, b) => l3[a].name.localeCompare(l3[b].name)) : [];
  const [sel, setSel] = useState({});
  const [metric, setMetric] = useState("agb_tonac");
  const [mgmts, setMgmts] = useState({ reserve: true, baseline: true });
  const [climate, setClimate] = useState("historic");
  const [price, setPrice] = useState("base");
  const [es, setEs] = useState("none");
  if (!l3) return <div className="empty">Scenario data loading…</div>;
  let selCodes = Object.keys(sel).filter((k) => sel[k] && l3[k]);
  if (!selCodes.length) selCodes = [codes[0]];
  const node = blendNode(selCodes.map((c) => l3[c]));

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
  const tAge = node.curves && node.curves[metric] && node.curves[metric].untreated && node.curves[metric].untreated.slice(-1)[0][0];
  const takeaway = (tAge && res && bas && atEnd(res) != null && atEnd(bas) != null)
    ? `At age ${tAge}, leaving this forest unharvested holds about ${fmt(atEnd(res))} vs ${fmt(atEnd(bas))} under harvest (${METRICS.find(([k])=>k===metric)[1].toLowerCase()}). The gap is the carbon-vs-income trade-off to weigh.`
    : null;

  const p = PRICE_PATHS[price];
  const eRes = econAt(node, "untreated", p), eBas = econAt(node, "harvested", p);
  const eResHi = econAt(node, "untreated", PRICE_PATHS.high), eBasHi = econAt(node, "harvested", PRICE_PATHS.high);
  const esAnnual = (ES_LEVELS.find(([k]) => k === es) || [])[2] || 0;
  const esAge = eRes.age || eBas.age || 100;
  const esNPVfull = esAnnual ? esAnnual * annuity(esAge, DISCOUNT) : 0;
  const esNPVmanaged = esNPVfull * ES_MANAGED_FRAC;
  const esFor = (k) => (k === "reserve" ? esNPVfull : esNPVmanaged);

  const econRows = MGMT.filter(([k]) => mgmts[k]).map(([k, lbl, curveKey, col]) => {
    const e = econAt(node, curveKey, p);
    const primary = k === "reserve" ? (e.npvC || 0) : (e.npvH || 0);
    return { k, lbl, col, e, esv: esFor(k), total: primary + esFor(k) };
  });

  // Decision synthesis: total NPV of keeping forest standing (carbon + ES) vs managing (timber + partial ES).
  const reserveTotal = (eRes.npvC || 0) + esNPVfull;
  const managedTotal = (eBas.npvH || 0) + esNPVmanaged;
  const carbonLean = reserveTotal > managedTotal;
  const flips = carbonLean !== (((eResHi.npvC || 0) + esNPVfull) > ((eBasHi.npvH || 0) + esNPVmanaged));
  const esClause = esAnnual ? " with ecosystem-service payments" : "";
  const decision = carbonLean
    ? `At ${p.label.toLowerCase()} market prices${esClause}, this forest is worth more standing: keeping it intact pencils out higher (~$${fmt(reserveTotal)}/ac NPV) than harvesting (~$${fmt(managedTotal)}/ac). A reserve or light-touch strategy looks favorable here${flips ? ", though that can flip toward harvest if timber prices run high." : "."}`
    : `At ${p.label.toLowerCase()} market prices${esAnnual ? " even with ecosystem-service payments" : ""}, active management pays: harvesting pencils out higher (~$${fmt(managedTotal)}/ac NPV) than keeping it standing (~$${fmt(reserveTotal)}/ac). A managed strategy looks favorable here${flips ? ", though keeping it standing can win if carbon or ES payments rise." : "."}`;

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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11 }}>
          <span style={{ color: "var(--mut)" }}>Your area:</span>
          {selCodes.map((c) => (
            <span key={c} style={{ ...chip(true), display: "inline-flex", gap: 5, alignItems: "center" }}>
              {l3[c].name}
              {selCodes.length > 1 && <span onClick={() => setSel((s) => ({ ...s, [c]: false }))} style={{ cursor: "pointer", fontWeight: 700 }}>×</span>}
            </span>
          ))}
          <select value="" onChange={(e) => { if (e.target.value) setSel((s) => ({ ...s, [e.target.value]: true })); }}
            style={{ background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 6px", fontSize: 11, maxWidth: 200 }}>
            <option value="">+ add ecoregion…</option>
            {codes.filter((c) => !selCodes.includes(c)).map((c) => <option key={c} value={c}>{l3[c].name}</option>)}
          </select>
        </div>
        <div className="note" style={{ marginTop: 4 }}>Select any combination to represent an ownership that spans regions or states, at any scale. Results blend across the areas you pick. A map-drawn AOI or uploaded inventory drives this directly for subscribers.</div>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11, marginBottom: 6 }}>
          <span style={{ color: "var(--mut)" }}>Market prices:</span>
          {Object.entries(PRICE_PATHS).map(([k, v]) => <span key={k} style={chip(price === k)} onClick={() => setPrice(k)}>{v.label}</span>)}
          <span style={{ color: "var(--mut)" }}>· carbon ${p.carbon}/tCO2e</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11 }}>
          <span style={{ color: "var(--mut)" }}>Ecosystem-service payments:</span>
          {ES_LEVELS.map(([k, lbl]) => <span key={k} style={chip(es === k)} onClick={() => setEs(k)}>{lbl}</span>)}
        </div>
      </div>

      {/* decision headline */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8, borderLeft: "3px solid " + (carbonLean ? "#2e9e6b" : "#d98a3c") }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>Recommendation</div>
        <div style={{ fontSize: 12 }}>{decision}</div>
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
            Net present value per acre · age {esAge} · {p.label} market{esAnnual ? ` · ES $${esAnnual}/ac/yr` : ""}
          </div>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: "var(--mut)", textAlign: "right" }}>
                <th style={{ textAlign: "left", fontWeight: 500 }}>Management</th>
                <th style={{ fontWeight: 500 }}>Timber</th>
                <th style={{ fontWeight: 500 }}>Carbon</th>
                <th style={{ fontWeight: 500 }}>Eco-services</th>
                <th style={{ fontWeight: 500 }}>Total NPV</th>
              </tr>
            </thead>
            <tbody>
              {econRows.map((r) => (
                <tr key={r.k} style={{ textAlign: "right", borderTop: "1px solid var(--line,#345)" }}>
                  <td style={{ textAlign: "left", color: r.col, fontWeight: 600 }}>{r.lbl.split(" ")[0]}</td>
                  <td>${fmt(r.e.npvH)}</td>
                  <td>${fmt(r.e.npvC)}</td>
                  <td>${fmt(r.esv)}</td>
                  <td style={{ fontWeight: 600 }}>${fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note" style={{ marginTop: 4 }}>
            Illustrative prices, 4% discount; ES paid per acre held (managed land at {Math.round(ES_MANAGED_FRAC * 100)}% of intact). The point is the trade-off across timber, carbon, and ecosystem services: which use wins depends on the prices and payments you assume, which is the decision the tool is built to inform.
          </div>
        </div>
      )}
    </div>
  );
}
