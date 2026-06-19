// "Compare my area to similar areas" view (the accessible, map-first direction).
// For a selected state, finds the most similar states by forest stress, resilience,
// and climate exposure, and shows a plain-language peer comparison. Uses the existing
// per-state HRR data (no new data dependency). Area unit is the state for now; a
// freehand draw-an-area version is the next iteration on top of the AOI report tool.
import { useState } from "react";

const REGION = {
  Northeast: ["ME","NH","VT","MA","RI","CT","NY","NJ","PA"],
  Midwest: ["OH","IN","IL","MI","WI","MN","IA","MO","ND","SD","NE","KS"],
  South: ["DE","MD","VA","WV","NC","SC","GA","FL","KY","TN","AL","MS","AR","LA","OK","TX"],
  West: ["MT","ID","WY","CO","NM","AZ","UT","NV","WA","OR","CA"],
};
const regionOf = (st) => Object.keys(REGION).find((r) => REGION[r].includes(st)) || "";

const fmt = (v, d = 1) => (v == null || isNaN(v) ? "–" : Number(v).toFixed(d));

// priority-share ramp (matches the health tab)
function ramp(pct) {
  const stops = [[43,138,99],[154,217,184],[230,210,74],[224,138,30],[204,59,34]];
  const t = Math.max(0, Math.min(1, pct / 75)) * (stops.length - 1);
  const i = Math.min(Math.floor(t), stops.length - 2);
  const f = t - i, a = stops[i], b = stops[i + 1];
  const c = [0,1,2].map((k) => Math.round(a[k] + f * (b[k] - a[k])));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export default function CompareAreas({ data, state, onPickState }) {
  const [sameRegion, setSameRegion] = useState(false);
  if (!data || !data[state])
    return <div className="empty">Pick a state on the map to compare it to similar areas.</div>;

  const all = Object.entries(data).map(([st, d]) => ({ st, region: regionOf(st), ...d }));
  // standardize the three axes for a fair distance
  const keys = ["stress_mean", "resil_mean", "ce_mean"];
  const stats = {};
  keys.forEach((k) => {
    const xs = all.map((r) => r[k]).filter((v) => v != null);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
    stats[k] = { m, sd };
  });
  const z = (r) => keys.map((k) => ((r[k] ?? stats[k].m) - stats[k].m) / stats[k].sd);
  const me = all.find((r) => r.st === state);
  const zMe = z(me);
  const dist = (r) => Math.sqrt(z(r).reduce((a, zk, i) => a + (zk - zMe[i]) ** 2, 0));

  let pool = all.filter((r) => r.st !== state);
  if (sameRegion && me.region) pool = pool.filter((r) => r.region === me.region);
  const peers = pool.map((r) => ({ ...r, d: dist(r) })).sort((a, b) => a.d - b.d).slice(0, 5);

  // peer comparison on the headline metric (priority share)
  const peerVals = peers.map((p) => p.priority_pct).filter((v) => v != null).sort((a, b) => a - b);
  const peerMed = peerVals.length ? peerVals[Math.floor(peerVals.length / 2)] : null;
  const peerLo = peerVals.length ? peerVals[0] : null;
  const peerHi = peerVals.length ? peerVals[peerVals.length - 1] : null;
  const stance = peerMed == null ? "" :
    me.priority_pct > peerMed * 1.15 ? "higher than" :
    me.priority_pct < peerMed * 0.85 ? "lower than" : "in line with";

  const maxBar = Math.max(me.priority_pct, ...peers.map((p) => p.priority_pct || 0)) || 1;
  const bars = [{ st: me.st, v: me.priority_pct, me: true }, ...peers.map((p) => ({ st: p.st, v: p.priority_pct }))];
  const barW = 230, rowH = 18, labW = 26;

  return (
    <div>
      <div className="who" style={{ marginBottom: 6 }}>
        <b>Compare {me.st} to similar areas</b>{" "}
        <span style={{ color: "var(--mut)" }}>· forest stress, resilience, climate exposure</span>
      </div>

      {/* plain-language readout */}
      <div className="chartcard" style={{ padding: "10px 12px", marginBottom: 8, fontSize: 13, lineHeight: 1.5 }}>
        {me.st}{me.region ? ` (${me.region})` : ""}'s priority forest area is <b>{fmt(me.priority_pct, 1)}%</b>.
        {" "}Among the {sameRegion ? "same-region " : ""}areas most similar to it ({peers.map((p) => p.st).join(", ")}),
        {" "}priority area runs {fmt(peerLo, 0)} to {fmt(peerHi, 0)}% (median {fmt(peerMed, 0)}%).
        {stance ? <> {me.st} sits <b>{stance}</b> its peers.</> : null}
      </div>

      {/* controls */}
      <div className="controls" style={{ marginBottom: 8 }}>
        <button className={"tab" + (!sameRegion ? " on" : "")} onClick={() => setSameRegion(false)}>Similar anywhere</button>
        <button className={"tab" + (sameRegion ? " on" : "")} onClick={() => setSameRegion(true)}
          disabled={!me.region} title={me.region ? `Restrict to ${me.region}` : "no region"}>Same region</button>
      </div>

      {/* comparison bars: your area vs peers on priority share */}
      <div className="chartcard" style={{ padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>Priority forest area (% of forest)</div>
        <svg width="100%" viewBox={`0 0 ${labW + barW + 30} ${bars.length * rowH + 4}`} style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
          {bars.map((b, i) => {
            const y = i * rowH + 2, w = ((b.v || 0) / maxBar) * barW;
            return (
              <g key={b.st} style={{ cursor: onPickState ? "pointer" : "default" }}
                onClick={() => onPickState && onPickState(b.st)}>
                <text x={labW - 4} y={y + rowH - 5} textAnchor="end" fontWeight={b.me ? 700 : 400}
                  fill={b.me ? "var(--fg,#e8edf2)" : "var(--mut,#8a93a0)"}>{b.st}</text>
                <rect x={labW} y={y} width={Math.max(1, w)} height={rowH - 5} rx={2}
                  fill={ramp(b.v || 0)} stroke={b.me ? "var(--fg,#fff)" : "none"} strokeWidth={b.me ? 1.4 : 0} />
                <text x={labW + w + 4} y={y + rowH - 5} fontWeight={b.me ? 700 : 400}
                  fill={b.me ? "var(--fg,#e8edf2)" : "var(--mut,#8a93a0)"}>{fmt(b.v, 1)}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* peer detail table */}
      <div className="chartcard" style={{ padding: "8px 10px" }}>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 4 }}>How the peers line up</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ color: "var(--mut)", textAlign: "right" }}>
              <th style={{ textAlign: "left" }}>Area</th><th>Priority %</th><th>Stress</th><th>Resilience</th><th>Climate exp.</th>
            </tr>
          </thead>
          <tbody>
            {[me, ...peers].map((r, i) => (
              <tr key={r.st} style={{ borderTop: "1px solid var(--bd,#2a3a47)", textAlign: "right",
                cursor: onPickState ? "pointer" : "default", fontWeight: r.st === state ? 700 : 400 }}
                onClick={() => onPickState && onPickState(r.st)}>
                <td style={{ textAlign: "left" }}>{r.st}{r.st === state ? " (your area)" : ""}</td>
                <td>{fmt(r.priority_pct, 1)}</td><td>{fmt(r.stress_mean, 3)}</td>
                <td>{fmt(r.resil_mean, 3)}</td><td>{fmt(r.ce_mean, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="note" style={{ marginTop: 6 }}>
          Similar areas are the states closest to {me.st} on standardized forest stress, resilience, and climate exposure. Area unit is the state; a draw-your-own-area version is the next step.
        </div>
      </div>
    </div>
  );
}
