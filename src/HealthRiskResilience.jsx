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

export default function HealthRiskResilience({ data, state }) {
  const [scenario, setScenario] = useState("current");
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

  return (
    <div>
      <div className="who" style={{ marginBottom: 6 }}>
        <b>Forest Health, Risk & Resilience</b>{" "}
        <span style={{ color: "var(--mut)" }}>
          · {data.coverage || "48 states"} · stress × resilience priority
        </span>
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
              <g key={r.st}>
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
