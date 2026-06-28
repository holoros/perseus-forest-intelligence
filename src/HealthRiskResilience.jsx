// Forest Health / Risk / Resilience (HRR) tab.
// Consumes api/hrr_states.json (schema hrr_states_v2): real 48-state results from
// 219,130 FIA plots. Stress = biomass-weighted Potter(2017) species VCC + observed
// FIA disturbance; Resilience = structure + VCC adaptive capacity; priority = high
// stress, low resilience. National scenario shares carry a 90% sampling band and a
// structural-uncertainty range. Self-contained: inline SVG, no new dependencies.
import { useState } from "react";

const SCEN = [
  ["current", "Current"],
  ["rcp45", "RCP4.5 (central)"],
  ["rcp85", "RCP8.5 (high-end)"],
];

// Sequential ramp for the priority-share bars (low -> high priority).
function rampColor(pct) {
  const t = Math.max(0, Math.min(1, pct / 75)); // 75% ~ national max (KS)
  const stops = ["#2f9e6a", "#9ad9b8", "#e6d24a", "#e08a1e", "#cc3b22"];
  const x = t * (stops.length - 1);
  const i = Math.floor(x);
  return stops[Math.min(i, stops.length - 1)];
}

const fmt = (v, d = 1) => (v == null || isNaN(v) ? "–" : Number(v).toFixed(d));

// Plain-language band for a Potter (2017) species climate-vulnerability score (VCC).
// National distribution across tracked species: ~17 to 61, median 32, p90 ~45.
// Bands chosen on that distribution so "Higher" really is the upper tail.
function vccBand(v) {
  if (v == null) return { label: "n/a", color: "var(--mut,#8a93a0)" };
  if (v >= 42) return { label: "Higher", color: "#c85a5a" };
  if (v >= 34) return { label: "Moderate", color: "#e08a1e" };
  return { label: "Lower", color: "#4f9d8a" };
}

export default function HealthRiskResilience({ data, detail, ecoData, landData, landEco, unit, onUnit, state, scenario: scenarioProp, onScenario, onPickState }) {
  const [scenarioLocal, setScenarioLocal] = useState("current");
  const [selOwn, setSelOwn] = useState(null); // landowner query selection
  const scenario = scenarioProp || scenarioLocal;
  const setScenario = onScenario || setScenarioLocal;
  if (!data || !data.national || !data.states)
    return <div className="empty">Forest health / risk / resilience data not loaded.</div>;

  const nat = data.national;
  const share = nat.scenario_priority_share_pct || {};
  const band = nat.scenario_90pct_band || {};
  const sr = nat.structural_uncertainty_pct_range || [];

  // Ranked states (descending current priority), with selected state highlighted.
  const rows = Object.entries(data.states)
    .map(([st, d]) => ({ st, ...d }))
    .sort((a, b) => b.priority_pct - a.priority_pct);
  const maxP = rows.length ? rows[0].priority_pct : 100;
  const selRow = data.states[state];

  const barW = 240;
  const rowH = 13;
  const labW = 26;

  const sc = share[scenario];
  const bd = band[scenario] || [];

  // Export the per-state HRR table as CSV, with a provenance + national-summary
  // header block so the download is self-documenting for reporting use.
  function downloadCsv() {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [];
    lines.push(`# PERSEUS Forest Health / Risk / Resilience (${data.schema || "hrr_states"})`);
    lines.push(`# coverage,${q(data.coverage || "")}`);
    lines.push(`# generated,${q(data.generated || "")}`);
    if (data.method) lines.push(`# method,${q(data.method)}`);
    lines.push(`# national_baseline_priority_pct,${nat.priority_share_pct ?? ""}`);
    lines.push(`# scenario_priority_pct_current,${share.current ?? ""}`);
    lines.push(`# scenario_priority_pct_rcp45,${share.rcp45 ?? ""}`);
    lines.push(`# scenario_priority_pct_rcp85,${share.rcp85 ?? ""}`);
    if (sr.length === 2) lines.push(`# structural_uncertainty_pct_range,${sr[0]}-${sr[1]}`);
    lines.push("state,n_plots,priority_pct,stress_mean,resil_mean,ce_mean");
    rows.forEach((r) => {
      lines.push([r.st, r.n_plots ?? "", r.priority_pct ?? "", r.stress_mean ?? "",
        r.resil_mean ?? "", r.ce_mean ?? ""].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "perseus_hrr_states.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="who" style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span>
          <b>Forest Health, Risk & Resilience</b>{" "}
          <span style={{ color: "var(--mut)" }}>
            · {data.coverage || "48 states"} · stress × resilience priority
          </span>
        </span>
        <button className="mini-btn" style={{ borderStyle: "solid", whiteSpace: "nowrap" }}
          onClick={downloadCsv} title="Download the per-state HRR table (CSV, with provenance header)">
          Download CSV
        </button>
      </div>

      {/* National headline */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
              {fmt(sc, 0)}%
            </div>
            <div style={{ fontSize: 11, color: "var(--mut)" }}>
              priority forest area · CONUS (national)
              {bd.length === 2 ? ` · 90% band ${bd[0]}–${bd[1]}%` : ""}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)", maxWidth: 320 }}>
            <b>What this is:</b> the share of the nation's forest most likely to need management
            attention — forest that is both highly stressed (climate exposure, sensitivity, and
            recent observed disturbance) and low in resilience (younger, less stocked, low adaptive
            capacity). The big number is the CONUS total; your selected state is shown below the map.
            National baseline <b>{fmt(nat.priority_share_pct, 1)}%</b>; sensitive to the
            scoring weights{sr.length === 2 ? ` (range ${sr[0]} to ${sr[1]}%)` : ""}, so quote it as a range.
          </div>
        </div>

        {/* Scenario priority with 90% error bars */}
        {share.current != null && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 2 }}>
              Priority forest area (% of forest) with 90% uncertainty band
            </div>
            {(() => {
              const rows3 = [["current", "Current"], ["rcp45", "RCP4.5 (central)"], ["rcp85", "RCP8.5 (high-end)"]];
              const hi = 45, W = 250, L = 96;
              return (
                <svg width="100%" viewBox={`0 0 ${L + W + 30} ${rows3.length * 18 + 4}`} style={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
                  {rows3.map(([k, lbl], i) => {
                    const v = share[k], bdk = band[k] || [v, v];
                    if (v == null) return null;
                    const y = i * 18 + 11, x = (p) => L + (p / hi) * W;
                    return (
                      <g key={k}>
                        <text x={L - 4} y={y + 3} textAnchor="end" fill="var(--mut,#8a93a0)">{lbl}</text>
                        <line x1={x(bdk[0])} x2={x(bdk[1])} y1={y} y2={y} stroke="#985356" strokeWidth={2} />
                        <line x1={x(bdk[0])} x2={x(bdk[0])} y1={y - 3} y2={y + 3} stroke="#985356" strokeWidth={1.5} />
                        <line x1={x(bdk[1])} x2={x(bdk[1])} y1={y - 3} y2={y + 3} stroke="#985356" strokeWidth={1.5} />
                        <circle cx={x(v)} cy={y} r={3.5} fill="#c85a5a" />
                        <text x={x(bdk[1]) + 6} y={y + 3} fill="var(--fg,#cdd)">{fmt(v, 0)}% [{fmt(bdk[0], 0)}–{fmt(bdk[1], 0)}]</text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        )}

        {/* Scenario toggle */}
        <div className="controls" style={{ marginTop: 8 }}>
          {SCEN.map(([k, lbl]) => (
            <button
              key={k}
              className={"tab" + (scenario === k ? " on" : "")}
              onClick={() => setScenario(k)}
              title={`Priority share under ${lbl}`}
            >
              {lbl} · {fmt(share[k], 0)}%
            </button>
          ))}
        </div>
        {nat.scenario_note && (
          <div className="note" style={{ marginTop: 6 }}>
            {nat.scenario_note}
          </div>
        )}
      </div>

      {/* Selected-state readout */}
      {selRow && (
        <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ fontSize: 12.5 }}>
            <b>{state}</b> · priority <b>{fmt(selRow.priority_pct, 1)}%</b> ·
            stress {fmt(selRow.stress_mean, 3)} · resilience {fmt(selRow.resil_mean, 3)} ·
            climate exposure {fmt(selRow.ce_mean, 0)} ·{" "}
            <span style={{ color: "var(--mut)" }}>n = {selRow.n_plots?.toLocaleString()} plots</span>
          </div>
        </div>
      )}

      {/* Bivariate key for the map surface: stress class (x) by resilience class (y). */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>
          Map colors — stress × resilience. Deep red = high stress, low resilience (priority).
        </div>
        <svg width="92" height="92" viewBox="0 0 92 92" style={{ fontSize: 8 }}>
          {(() => {
            const PAL = [["#e8e8e8","#e4acac","#c85a5a"],["#b0d5df","#ad9ea5","#985356"],["#64acbe","#627f8c","#574249"]];
            const cells = [];
            for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++)
              cells.push(<rect key={sx+"-"+sy} x={20 + sx*20} y={4 + (2-sy)*20} width={20} height={20} fill={PAL[sy][sx]} />);
            return cells;
          })()}
          <text x="20" y="82" fill="var(--mut)">stress →</text>
          <text x="14" y="64" fill="var(--mut)" transform="rotate(-90 14 64)">resilience →</text>
        </svg>
      </div>

      {/* Map unit toggle: smoothed surface vs county centroids. */}
      {onUnit && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, fontSize: 11 }}>
          <span style={{ color: "var(--mut)" }}>Map unit:</span>
          {[["surface", "Surface"], ["hex", "Hexes"], ["county", "Counties"], ["ecoregion", "Ecoregion"]].map(([k, lbl]) => (
            <button key={k} onClick={() => onUnit(k)}
              style={{ fontSize: 11, padding: "1px 8px", borderRadius: 3, cursor: "pointer",
                border: "1px solid var(--bd,#345)", background: (unit || "surface") === k ? "#3a6ea5" : "transparent",
                color: (unit || "surface") === k ? "#fff" : "var(--fg,#cdd)" }}>{lbl}</button>
          ))}
        </div>
      )}

      {/* Landowner view: priority by FIA ownership group. */}
      {landData && landData.landowners && (
        <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>
            By ownership — priority share of forest <span style={{ opacity: .7 }}>(click to query)</span>
          </div>
          {Object.entries(landData.landowners).sort((a, b) => b[1].priority_pct - a[1].priority_pct).map(([nm, d]) => (
            <div key={nm} onClick={() => setSelOwn(selOwn === nm ? null : nm)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginBottom: 1, cursor: "pointer",
                background: selOwn === nm ? "rgba(58,110,165,0.18)" : "transparent", borderRadius: 3, padding: "1px 2px" }}>
              <span style={{ width: 96, fontWeight: selOwn === nm ? 700 : 400 }}>{nm}</span>
              <span style={{ flex: 1, background: "var(--bg2,#1b2530)", height: 9, borderRadius: 2, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.min(100, d.priority_pct * 4)}%`, background: rampColor(d.priority_pct) }} />
              </span>
              <span style={{ width: 30, textAlign: "right" }}>{fmt(d.priority_pct, 0)}%</span>
            </div>
          ))}
          {selOwn && landData.landowners[selOwn] && (
            <div style={{ fontSize: 10, marginTop: 5, padding: "5px 7px", borderRadius: 4, background: "rgba(58,110,165,0.12)" }}>
              <b>{selOwn}</b>: priority {fmt(landData.landowners[selOwn].priority_pct, 1)}% · stress {fmt(landData.landowners[selOwn].stress_mean, 3)} · resilience {fmt(landData.landowners[selOwn].resil_mean, 3)} · n = {landData.landowners[selOwn].n != null ? landData.landowners[selOwn].n.toLocaleString() : "–"} plots.
            </div>
          )}
          <div style={{ fontSize: 9.5, color: "var(--mut)", marginTop: 3 }}>
            Private and state/local forest carries more priority area than federal/National Forest. These are national aggregates; a per-state ownership filter needs per-state ownership data.
          </div>
        </div>
      )}

      {/* Ecoregion view: priority by EPA Level III ecoregion (selectable unit). */}
      {ecoData && ecoData.ecoregions && (() => {
        const rowsE = Object.entries(ecoData.ecoregions).map(([code, v]) => ({ code, ...v }))
          .sort((a, b) => b.priority_pct - a.priority_pct);
        const maxE = rowsE.length ? rowsE[0].priority_pct : 100;
        const top = rowsE.slice(0, 8);
        const topOwn = (code) => {
          const o = landEco && landEco.ecoregions && landEco.ecoregions[code] && landEco.ecoregions[code].own;
          if (!o) return null;
          const t = Object.entries(o).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
          return t ? `${t[0]} ${Math.round(t[1])}%` : null;
        };
        return (
          <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>
              By EPA Level III ecoregion — highest priority share ({rowsE.length} ecoregions){landEco ? " · dominant owner" : ""}
            </div>
            {top.map((e) => { const to = topOwn(e.code); return (
              <div key={e.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginBottom: 1 }}>
                <span style={{ width: 138, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                <span style={{ flex: 1, background: "var(--bg2,#1b2530)", height: 9, borderRadius: 2, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${Math.min(100, e.priority_pct / maxE * 100)}%`, background: rampColor(e.priority_pct) }} />
                </span>
                <span style={{ width: 36, textAlign: "right" }}>{fmt(e.priority_pct, 0)}%{e.priority_pct >= 99.5 ? "*" : ""}</span>
                {to && <span style={{ width: 84, textAlign: "right", color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{to}</span>}
              </div>
            ); })}
            <div style={{ fontSize: 9.5, color: "var(--mut)", marginTop: 3 }}>
              Dry-edge and prairie ecoregions rank highest; productive forested ecoregions lowest.{top.some(e => e.priority_pct >= 99.5) ? " * a near-100% share reflects very little forested area in that ecoregion (small sample); interpret with caution." : ""}{landEco ? " Dominant forest owner from the USDA FS ownership raster." : ""}
            </div>
          </div>
        );
      })()}

      {/* Per-state drill-down: top vulnerable species, observed agents, dead/live. */}
      {(() => {
        const dd = detail && detail.states && detail.states[state];
        if (!dd) return null;
        const ag = dd.agents || {};
        const agentRows = [["insect", ag.insect], ["disease", ag.disease], ["weather", ag.weather],
          ["animal", ag.animal], ["fire", ag.fire]].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        return (
          <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>
              {state} detail — what drives the score
            </div>
            <div style={{ fontSize: 10.5, marginBottom: 1 }}><b>Top species by biomass &amp; their climate vulnerability</b></div>
            <div style={{ fontSize: 9.5, color: "var(--mut)", marginBottom: 4 }}>
              Each species placed by its climate vulnerability (Potter 2017 score, x) and its share of biomass (y).
              The upper right is abundant <i>and</i> vulnerable — the species to act on. Colored by vulnerability:{" "}
              <span style={{ color: "#4f9d8a" }}>● Lower</span> <span style={{ color: "#e08a1e" }}>● Moderate</span> <span style={{ color: "#c85a5a" }}>● Higher</span> (US median ≈ 32).
            </div>
            {/* Quadrant scatter: vulnerability (x) vs biomass share (y). Upper-right = priority. */}
            {(() => {
              const pts = (dd.top_species || []).filter((s) => s.vcc != null && s.share_pct != null);
              if (pts.length < 2) return null;
              const W = 320, H = 188, M = { l: 30, r: 70, t: 12, b: 26 };
              const vcs = pts.map((s) => s.vcc), shs = pts.map((s) => s.share_pct);
              const vlo = Math.max(16, Math.min(28, Math.min(...vcs)) - 2);
              const vhi = Math.min(62, Math.max(44, Math.max(...vcs)) + 2);
              const smax = Math.max(...shs) * 1.18 || 1;
              const px = (v) => M.l + (v - vlo) / (vhi - vlo) * (W - M.l - M.r);
              const py = (s) => H - M.b - (s / smax) * (H - M.t - M.b);
              const medX = px(32), modX = px(38);
              // light vertical de-overlap of labels sharing a similar y
              const lab = pts.map((s) => ({ s, x: px(s.vcc), y: py(s.share_pct) }))
                .sort((a, b) => a.y - b.y);
              for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 10) lab[i].y = lab[i - 1].y + 10;
              return (
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ fontSize: 9, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
                  <rect x={modX} y={M.t} width={(W - M.r) - modX} height={(H - M.b) - M.t} fill="rgba(200,90,90,0.07)" />
                  <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} stroke="var(--line,#345)" strokeWidth={0.7} />
                  <line x1={M.l} y1={M.t} x2={M.l} y2={H - M.b} stroke="var(--line,#345)" strokeWidth={0.7} />
                  <line x1={medX} y1={M.t} x2={medX} y2={H - M.b} stroke="var(--mut,#8a93a0)" strokeDasharray="3 3" strokeWidth={0.7} />
                  <text x={medX} y={M.t - 2} textAnchor="middle" fill="var(--mut,#8a93a0)" fontSize={7.5}>US median</text>
                  {[vlo, (vlo + vhi) / 2, vhi].map((t, i) => <text key={i} x={px(t)} y={H - M.b + 11} textAnchor="middle" fill="var(--mut,#8a93a0)">{Math.round(t)}</text>)}
                  {[0, smax / 2, smax].map((t, i) => <text key={i} x={M.l - 3} y={py(t) + 3} textAnchor="end" fill="var(--mut,#8a93a0)">{Math.round(t)}%</text>)}
                  <text x={(M.l + W - M.r) / 2} y={H - 1} textAnchor="middle" fill="var(--mut,#8a93a0)">climate vulnerability →</text>
                  <text x={M.l - 24} y={M.t + 2} fill="var(--mut,#8a93a0)" fontSize={8}>share ↑</text>
                  <text x={W - M.r - 2} y={M.t + 8} textAnchor="end" fill="#c85a5a" fontSize={7.5} opacity={0.85}>abundant &amp; vulnerable</text>
                  {lab.map(({ s, x, y }) => {
                    const vb = vccBand(s.vcc), cy = py(s.share_pct);
                    return (
                      <g key={s.spcd}>
                        <circle cx={x} cy={cy} r={4.5} fill={vb.color} stroke="#0b1015" strokeWidth={0.6}>
                          <title>{`${s.common}: ${fmt(s.share_pct, 0)}% of biomass, vulnerability ${fmt(s.vcc, 0)} (${vb.label})`}</title>
                        </circle>
                        <text x={x + 6} y={y + 3} fill="var(--fg,#cdd)" fontSize={8}>{s.common.length > 14 ? s.common.slice(0, 13) + "…" : s.common}</text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
            <div style={{ fontSize: 9.5, color: "var(--mut)", marginBottom: 2, marginTop: 2 }}>Ranked detail:</div>
            {dd.top_species && dd.top_species.map((sp) => {
              const vb = vccBand(sp.vcc);
              return (
              <div key={sp.spcd} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginBottom: 1 }}>
                <span style={{ width: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sp.common}</span>
                <span style={{ flex: 1, background: "var(--bg2,#1b2530)", height: 9, borderRadius: 2, overflow: "hidden" }}
                  title={`${sp.common}: ${fmt(sp.share_pct,0)}% of biomass · vulnerability ${sp.vcc==null?"n/a":fmt(sp.vcc,0)} (${vb.label})`}>
                  <span style={{ display: "block", height: "100%", width: `${Math.min(100, sp.share_pct * 3)}%`, background: vb.color }} />
                </span>
                <span style={{ width: 30, textAlign: "right" }}>{fmt(sp.share_pct, 0)}%</span>
                <span style={{ width: 78, textAlign: "right", color: vb.color, fontWeight: 600 }}>
                  {vb.label}{sp.vcc != null ? ` ${fmt(sp.vcc, 0)}` : ""}
                </span>
              </div>
            );})}
            {(() => {
              const sps = dd.top_species || [];
              // Decision focus: species that are BOTH abundant and at least moderately vulnerable.
              const watch = sps.filter((s) => s.vcc != null && s.vcc >= 38 && s.share_pct >= 8)
                .sort((a, b) => (b.vcc * b.share_pct) - (a.vcc * a.share_pct));
              return (
                <div style={{ fontSize: 9.5, marginTop: 5, padding: "5px 7px", borderRadius: 5,
                  background: "rgba(200,90,90,0.08)", border: "1px solid var(--line,#2a3a47)", lineHeight: 1.4 }}>
                  <b style={{ color: "var(--fg,#ddd)" }}>What to do with this:</b>{" "}
                  {watch.length
                    ? <>{watch.map((s) => s.common).join(", ")} {watch.length > 1 ? "are" : "is"} both abundant and climate-vulnerable here — the clearest priority. Favor regenerating and retaining the lower-vulnerability species, diversify away from heavy reliance on the flagged ones, and watch them in the near-term disturbance feed.</>
                    : <>No single abundant species here is highly vulnerable; vulnerability is spread across species, so broad diversification and maintaining structure matter more than targeting one species.</>}
                </div>
              );
            })()}
            <div style={{ fontSize: 10, marginTop: 6, color: "var(--mut)" }}>
              <b style={{ color: "var(--fg,#ddd)" }}>Observed disturbance:</b>{" "}
              {ag.disturbed_pct != null ? `${fmt(ag.disturbed_pct, 0)}% of plots` : "–"}
              {agentRows.length ? " · " + agentRows.map(([k, v]) => `${k} ${fmt(v, 0)}%`).join(", ") : ""}
              {dd.dead_live_pct != null && <> · dead/live biomass {fmt(dd.dead_live_pct, 0)}%</>}
            </div>
          </div>
        );
      })()}

      {/* Stress vs resilience scatter (the two axes behind the priority class) */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>
          Stress vs resilience by state — priority is high stress, low resilience (shaded, lower right)
        </div>
        {(() => {
          const sw = 320, sh = 210, m = { l: 30, r: 10, t: 10, b: 24 };
          const xs = rows.map((r) => r.stress_mean);
          const ys = rows.map((r) => r.resil_mean);
          const xmin = Math.min(...xs), xmax = Math.max(...xs);
          const ymin = Math.min(...ys), ymax = Math.max(...ys);
          const padx = (xmax - xmin) * 0.08 || 0.05;
          const pady = (ymax - ymin) * 0.08 || 0.05;
          const x0 = xmin - padx, x1 = xmax + padx, y0 = ymin - pady, y1 = ymax + pady;
          const px = (v) => m.l + ((v - x0) / (x1 - x0)) * (sw - m.l - m.r);
          const py = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (sh - m.t - m.b);
          const med = (a) => { const s = [...a].sort((p, q) => p - q); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
          const mx = med(xs), my = med(ys);
          return (
            <svg width="100%" viewBox={`0 0 ${sw} ${sh}`} style={{ fontSize: 9, fontVariantNumeric: "tabular-nums" }}>
              {/* priority quadrant: high stress (x > mx), low resilience (y < my) */}
              <rect x={px(mx)} y={py(y1)} width={px(x1) - px(mx)} height={py(my) - py(y1)} fill="#cc3b22" opacity={0.08} />
              {/* median dividers */}
              <line x1={px(mx)} y1={py(y0)} x2={px(mx)} y2={py(y1)} stroke="var(--mut,#8a93a0)" strokeWidth={0.5} strokeDasharray="3 3" />
              <line x1={px(x0)} y1={py(my)} x2={px(x1)} y2={py(my)} stroke="var(--mut,#8a93a0)" strokeWidth={0.5} strokeDasharray="3 3" />
              {/* axes */}
              <line x1={m.l} y1={py(y0)} x2={sw - m.r} y2={py(y0)} stroke="var(--mut,#8a93a0)" strokeWidth={0.6} />
              <line x1={m.l} y1={m.t} x2={m.l} y2={py(y0)} stroke="var(--mut,#8a93a0)" strokeWidth={0.6} />
              {/* points */}
              {rows.map((r) => {
                const on = r.st === state;
                return (
                  <g key={r.st} style={{ cursor: onPickState ? "pointer" : "default" }}
                    onClick={() => onPickState && onPickState(r.st)}>
                    <circle cx={px(r.stress_mean)} cy={py(r.resil_mean)} r={on ? 4 : 2.6}
                      fill={rampColor(r.priority_pct)} stroke={on ? "var(--fg,#fff)" : "#0b1015"}
                      strokeWidth={on ? 1.2 : 0.3}>
                      <title>{`${r.st} · priority ${fmt(r.priority_pct, 1)}% · stress ${fmt(r.stress_mean, 3)} · resilience ${fmt(r.resil_mean, 3)}`}</title>
                    </circle>
                    {on && <text x={px(r.stress_mean) + 5} y={py(r.resil_mean) - 5} fill="var(--fg,#e8edf2)" fontWeight={700}>{r.st}</text>}
                  </g>
                );
              })}
              {/* axis labels */}
              <text x={(m.l + sw - m.r) / 2} y={sh - 4} textAnchor="middle" fill="var(--mut,#8a93a0)">stress &#8594;</text>
              <text x={9} y={(m.t + py(y0)) / 2} textAnchor="middle" fill="var(--mut,#8a93a0)"
                transform={`rotate(-90 9 ${(m.t + py(y0)) / 2})`}>resilience &#8594;</text>
            </svg>
          );
        })()}
        <div className="note" style={{ marginTop: 2 }}>
          Dashed lines are the median state stress and resilience (a visual guide; the published class uses shared national tertile breaks).
        </div>
      </div>

      {/* Ranked per-state priority bars */}
      <div className="chartcard" style={{ padding: "8px 10px" }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>
          Per-state priority forest area (current), ranked
        </div>
        <svg
          width="100%"
          viewBox={`0 0 ${labW + barW + 34} ${rows.length * rowH + 6}`}
          style={{ fontSize: 9, fontVariantNumeric: "tabular-nums" }}
        >
          {rows.map((r, i) => {
            const y = i * rowH + 3;
            const w = (r.priority_pct / maxP) * barW;
            const on = r.st === state;
            return (
              <g key={r.st} style={{ cursor: onPickState ? "pointer" : "default" }}
                onClick={() => onPickState && onPickState(r.st)}>
                <text x={labW - 4} y={y + rowH - 4} textAnchor="end"
                  fill={on ? "var(--fg,#e8edf2)" : "var(--mut,#8a93a0)"}
                  fontWeight={on ? 700 : 400}>
                  {r.st}
                </text>
                <rect x={labW} y={y} width={Math.max(1, w)} height={rowH - 4}
                  rx={1.5} fill={rampColor(r.priority_pct)}
                  stroke={on ? "var(--fg,#fff)" : "none"} strokeWidth={on ? 1 : 0} />
                <text x={labW + w + 3} y={y + rowH - 4}
                  fill={on ? "var(--fg,#e8edf2)" : "var(--mut,#8a93a0)"}
                  fontWeight={on ? 700 : 400}>
                  {fmt(r.priority_pct, 0)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Caveats / provenance */}
      {Array.isArray(data.caveats) && data.caveats.length > 0 && (
        <div className="note" style={{ marginTop: 6 }}>
          {data.caveats.map((c, i) => (
            <div key={i}>· {c}</div>
          ))}
          {data.provenance && (
            <div style={{ marginTop: 4 }}>
              Sources: FIA PLOT/COND/TREE; Potter, Crane & Hargrove (2017) species VCC;
              FIA observed disturbance (DSTRBCD).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
