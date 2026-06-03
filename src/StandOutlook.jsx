// Stand Outlook — landowner-scale analytics core (PERSEUS Obj. 2).
// Estimates where a stand likely lies now (with a confidence interval) and shows
// the diverging management pathways from that decision point: reserve (carbon)
// vs managed (fiber). Uncertainty widens with the projection horizon. Stand age
// is user-scrubbable and the current value can be calibrated to a landowner's
// own inventory for iterative analysis. Data: ycx yield curves by EPA L3.
import { useState, useEffect } from "react";

const RESP = [
  { key: "carbon_lbac",     label: "AG carbon",      unit: "ton C/ac", scale: 1 / 2000 },
  { key: "agb_tonac",       label: "Aboveground biomass", unit: "ton/ac", scale: 1 },
  { key: "merchvol_cuftac", label: "Merch. volume",  unit: "cu ft/ac", scale: 1 },
  { key: "ba_ft2ac",        label: "Basal area",     unit: "sq ft/ac", scale: 1 },
  { key: "tpa_total",       label: "Trees",          unit: "per ac",   scale: 1 },
];
const HORIZONS = [0, 10, 30, 50]; // years ahead: now, short, mid, long

function interp(curve, age) {
  if (!curve || !curve.length) return null;
  if (age <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (age <= curve[i][0]) {
      const [a0, v0] = curve[i - 1], [a1, v1] = curve[i];
      return v0 + (v1 - v0) * (age - a0) / (a1 - a0);
    }
  }
  return curve[curve.length - 1][1]; // flat at maturity beyond the fitted range
}
const fmt = (v) => v == null ? "—" : (Math.abs(v) >= 100 ? Math.round(v).toLocaleString()
  : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));

export default function StandOutlook({ aoi }) {
  const all = aoi && aoi.allCurves;
  const fiaAge = aoi && aoi.plotStats && aoi.plotStats.meanAge;
  const [resp, setResp] = useState("carbon_lbac");
  const [age, setAge] = useState(Math.round(fiaAge || 45));
  const [cal, setCal] = useState("");
  useEffect(() => { setAge(Math.round((aoi && aoi.plotStats && aoi.plotStats.meanAge) || 45)); setCal(""); },
    [aoi && aoi.l3code]);

  if (!all) return <div className="note" style={{ margin: "6px 2px" }}>No fitted yield curve for this ecoregion yet.</div>;
  const r = RESP.find(x => x.key === resp) || RESP[0];
  const cu = all[resp];
  if (!cu || !cu.untreated) return <div className="note" style={{ margin: "6px 2px" }}>This response has no fitted curve here.</div>;

  let unt = cu.untreated.map(([a, v]) => [a, v * r.scale]);
  let har = cu.harvested.map(([a, v]) => [a, v * r.scale]);
  const base = interp(unt, age);
  const calNum = parseFloat(cal);
  if (isFinite(calNum) && calNum > 0 && base > 0) {
    const k = calNum / base;
    unt = unt.map(([a, v]) => [a, v * k]);
    har = har.map(([a, v]) => [a, v * k]);
  }

  // confidence half-width (relative): tighter now, widening with the projection horizon
  const ci = (a) => Math.min(0.35, 0.10 + 0.004 * Math.max(0, a - age) + (isFinite(calNum) && calNum > 0 ? 0 : 0.02));

  // chart geometry
  const W = 480, H = 226, P = { l: 48, r: 14, t: 16, b: 26 };
  const AGES = []; for (let a = 0; a <= 100; a += 2.5) AGES.push(a);
  const valU = AGES.map(a => [a, interp(unt, a)]);
  const valH = AGES.map(a => [a, interp(har, a)]);
  const xmax = 100;
  const ymax = Math.max(...valU.map(p => p[1] * (1 + ci(p[0]))), ...valH.map(p => p[1] * (1 + ci(p[0])))) * 1.05 || 1;
  const sx = a => P.l + (a / xmax) * (W - P.l - P.r);
  const sy = v => H - P.b - (v / ymax) * (H - P.t - P.b);
  const line = c => "M" + c.map(([a, v]) => `${sx(a).toFixed(1)} ${sy(v).toFixed(1)}`).join(" L");
  const band = c => {
    const lo = c.map(([a, v]) => `${sx(a).toFixed(1)} ${sy(v * (1 - ci(a))).toFixed(1)}`);
    const hi = c.slice().reverse().map(([a, v]) => `${sx(a).toFixed(1)} ${sy(v * (1 + ci(a))).toFixed(1)}`);
    return "M" + lo.join(" L") + " L" + hi.join(" L") + " Z";
  };
  const nowU = interp(unt, age), nowH = interp(har, age);
  const nowLo = nowU * (1 - ci(age)), nowHi = nowU * (1 + ci(age));
  const yt = [0, 0.5, 1].map(f => +(ymax * f).toFixed(ymax < 10 ? 1 : 0));
  const xt = [0, 25, 50, 75, 100];

  return (
    <div className="stand-outlook">
      <div className="so-head">
        <b>Stand Outlook</b>
        <select value={resp} onChange={e => setResp(e.target.value)} title="Response variable">
          {RESP.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {yt.map((t, i) => (<g key={t + "_" + i}>
          <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth="0.5" />
          <text x={P.l - 6} y={sy(t) + 3} textAnchor="end" fontSize="9" fill="var(--mut)">{t}</text>
        </g>))}
        {xt.map(t => <text key={t} x={sx(t)} y={H - 9} textAnchor="middle" fontSize="9" fill="var(--mut)">{t}</text>)}
        <text x={(P.l + W - P.r) / 2} y={H - 0.5} textAnchor="middle" fontSize="9" fill="var(--mut)">Stand age (yr)</text>
        <text x={4} y={10} fontSize="9" fill="var(--mut)">{r.unit}</text>
        {/* decision line */}
        <line x1={sx(age)} x2={sx(age)} y1={P.t} y2={H - P.b} stroke="#f4c430" strokeWidth="1" strokeDasharray="3 2" />
        {/* confidence bands (pathways) */}
        <path d={band(valU)} fill="#3fb68b" opacity="0.16" />
        <path d={band(valH)} fill="#e6ab02" opacity="0.16" />
        <path d={line(valU)} fill="none" stroke="#3fb68b" strokeWidth="2" />
        <path d={line(valH)} fill="none" stroke="#e6ab02" strokeWidth="2" />
        {/* current estimate as a confidence range */}
        <line x1={sx(age)} x2={sx(age)} y1={sy(nowLo)} y2={sy(nowHi)} stroke="#f4c430" strokeWidth="3" strokeLinecap="round" />
        <circle cx={sx(age)} cy={sy(nowU)} r="3" fill="#f4c430" stroke="#fff" strokeWidth="1" />
        <text x={sx(age)} y={P.t + 9} textAnchor="middle" fontSize="9" fill="#f4c430">est. now</text>
      </svg>
      <div className="lgd" style={{ marginTop: 4 }}>
        <span><i style={{ background: "#3fb68b", width: 14, height: 3 }} />reserve (carbon) pathway</span>
        <span><i style={{ background: "#e6ab02", width: 14, height: 3 }} />managed (fiber) pathway</span>
        <span><i style={{ background: "#f4c430", width: 14, height: 3 }} />estimate ± interval</span>
      </div>

      <div className="so-now">
        Estimated now (age <b>{age}</b>): <b>{fmt(nowU)}</b> <span style={{ color: "var(--mut)" }}>{r.unit} (likely {fmt(nowLo)}–{fmt(nowHi)})</span>
      </div>

      <div className="so-ctrl">
        <label>Stand age <b>{age} yr</b>{fiaAge ? <span className="so-fia"> · FIA mean {Math.round(fiaAge)}</span> : null}</label>
        <input type="range" min="5" max="100" step="1" value={age} onChange={e => setAge(+e.target.value)} />
      </div>
      <div className="so-ctrl">
        <label>Calibrate to my stand <span style={{ color: "var(--mut)" }}>({r.unit} now, optional)</span></label>
        <input type="number" className="so-num" placeholder={fmt(interp(cu.untreated.map(([a, v]) => [a, v * r.scale]), age))}
          value={cal} onChange={e => setCal(e.target.value)} />
      </div>

      <table className="so-table">
        <thead><tr><th>Pathway outlook</th><th>Age</th><th style={{ color: "#3fb68b" }}>Reserve</th><th style={{ color: "#e6ab02" }}>Managed</th></tr></thead>
        <tbody>
          {HORIZONS.map(h => {
            const fa = Math.min(age + h, 100);
            const u = interp(unt, fa), hv = interp(har, fa), c = ci(fa);
            const rng = (v) => `${fmt(v * (1 - c))}–${fmt(v * (1 + c))}`;
            const lbl = h === 0 ? "Now" : h <= 10 ? `+${h} yr (short)` : h >= 50 ? `+${h} yr (long)` : `+${h} yr`;
            return (<tr key={h}>
              <td>{lbl}</td><td>{fa}{age + h > 100 ? "+" : ""}</td>
              <td style={{ color: "#3fb68b" }}>{rng(u)}</td>
              <td style={{ color: "#e6ab02" }}>{rng(hv)}</td>
            </tr>);
          })}
        </tbody>
      </table>
      <div className="note" style={{ marginTop: 4 }}>
        Estimated <b>{r.label.toLowerCase()}</b> for a stand in <b>{aoi.l3name || aoi.l3code}</b>, with a confidence interval
        that widens as the projection extends. From the decision point, the two management pathways diverge:
        <b style={{ color: "#3fb68b" }}> reserve</b> (let it grow, maximize carbon) versus
        <b style={{ color: "#e6ab02" }}> managed</b> (active harvest, fiber value). Scrub the stand age or enter your
        measured value to calibrate to your stand. Curves capped at the 100 yr fitted range.
      </div>
    </div>
  );
}
