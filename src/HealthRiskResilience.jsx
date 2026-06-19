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

export default function HealthRiskResilience({ data, state, scenario: scenarioProp, onScenario, onPickState }) {
  const [scenarioLocal, setScenarioLocal] = useState("current");
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
              priority forest area
              {bd.length === 2 ? ` · 90% band ${bd[0]}–${bd[1]}%` : ""}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)", maxWidth: 300 }}>
            High stress + low resilience. National baseline share{" "}
            <b>{fmt(nat.priority_share_pct, 1)}%</b>; sensitive to scoring weights
            {sr.length === 2 ? ` (range ${sr[0]}–${sr[1]}%)` : ""}. Quote as a range.
          </div>
        </div>

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
