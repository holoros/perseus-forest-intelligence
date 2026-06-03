// Stand Outlook — the landowner-scale analytics core (PERSEUS Obj. 2).
// Places a stand on its ecoregion yield curve and shows short- and long-term
// outcomes under a reserve (carbon) vs managed (fiber) trajectory, with a
// user-scrubbable stand age and an optional calibrate-to-my-stand override so
// landowners can supply their own inventory and iterate. Data: ycx by EPA L3.
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
  const [cal, setCal] = useState("");           // user's measured current value (optional)
  useEffect(() => { setAge(Math.round((aoi && aoi.plotStats && aoi.plotStats.meanAge) || 45)); setCal(""); },
    [aoi && aoi.l3code]);

  if (!all) return <div className="note" style={{ margin: "6px 2px" }}>No fitted yield curve for this ecoregion yet.</div>;
  const r = RESP.find(x => x.key === resp) || RESP[0];
  const cu = all[resp];
  if (!cu || !cu.untreated) return <div className="note" style={{ margin: "6px 2px" }}>This response has no fitted curve here.</div>;

  let unt = cu.untreated.map(([a, v]) => [a, v * r.scale]);
  let har = cu.harvested.map(([a, v]) => [a, v * r.scale]);
  // calibrate: scale both curves so reserve passes through (age, userValue)
  const calNum = parseFloat(cal);
  const base = interp(unt, age);
  if (isFinite(calNum) && calNum > 0 && base > 0) {
    const k = calNum / base;
    unt = unt.map(([a, v]) => [a, v * k]);
    har = har.map(([a, v]) => [a, v * k]);
  }

  // chart geometry
  const W = 480, H = 220, P = { l: 48, r: 14, t: 12, b: 26 };
  const xmax = 100, ymax = Math.max(...unt.map(p => p[1]), ...har.map(p => p[1])) * 1.08 || 1;
  const sx = a => P.l + (a / xmax) * (W - P.l - P.r);
  const sy = v => H - P.b - (v / ymax) * (H - P.t - P.b);
  const path = c => "M" + c.map(([a, v]) => `${sx(a).toFixed(1)} ${sy(v).toFixed(1)}`).join(" L");
  const nowU = interp(unt, age), nowH = interp(har, age);
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
        {yt.map(t => (<g key={t}>
          <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth="0.5" />
          <text x={P.l - 6} y={sy(t) + 3} textAnchor="end" fontSize="9" fill="var(--mut)">{t}</text>
        </g>))}
        {xt.map(t => <text key={t} x={sx(t)} y={H - 9} textAnchor="middle" fontSize="9" fill="var(--mut)">{t}</text>)}
        <text x={(P.l + W - P.r) / 2} y={H - 0.5} textAnchor="middle" fontSize="9" fill="var(--mut)">Stand age (yr)</text>
        <text x={4} y={P.t + 4} fontSize="9" fill="var(--mut)">{r.unit}</text>
        {/* reserve (carbon) vs managed (fiber) */}
        <path d={path(unt)} fill="none" stroke="#3fb68b" strokeWidth="2" />
        <path d={path(har)} fill="none" stroke="#e6ab02" strokeWidth="2" />
        {/* you are here */}
        <line x1={sx(age)} x2={sx(age)} y1={P.t} y2={H - P.b} stroke="#f4c430" strokeWidth="1" strokeDasharray="3 2" />
        <circle cx={sx(age)} cy={sy(nowU)} r="3.5" fill="#3fb68b" stroke="#fff" strokeWidth="1" />
        <circle cx={sx(age)} cy={sy(nowH)} r="3.5" fill="#e6ab02" stroke="#fff" strokeWidth="1" />
        <text x={sx(age)} y={P.t + 9} textAnchor="middle" fontSize="9" fill="#f4c430">you are here</text>
      </svg>
      <div className="lgd" style={{ marginTop: 4 }}>
        <span><i style={{ background: "#3fb68b", width: 14, height: 3 }} />reserve (carbon)</span>
        <span><i style={{ background: "#e6ab02", width: 14, height: 3 }} />managed (fiber)</span>
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
        <thead><tr><th>Horizon</th><th>Age</th><th style={{ color: "#3fb68b" }}>Reserve</th><th style={{ color: "#e6ab02" }}>Managed</th></tr></thead>
        <tbody>
          {HORIZONS.map(h => {
            const fa = Math.min(age + h, 100);
            const u = interp(unt, fa), hv = interp(har, fa);
            const lbl = h === 0 ? "Now" : h <= 10 ? `+${h} yr (short)` : h >= 50 ? `+${h} yr (long)` : `+${h} yr`;
            return (<tr key={h}>
              <td>{lbl}</td><td>{fa}{age + h > 100 ? "+" : ""}</td>
              <td style={{ color: "#3fb68b" }}>{fmt(u)}</td>
              <td style={{ color: "#e6ab02" }}>{fmt(hv)}</td>
            </tr>);
          })}
        </tbody>
      </table>
      <div className="note" style={{ marginTop: 4 }}>
        Where this stand sits on the FIA-fitted growth curve for <b>{aoi.l3name || aoi.l3code}</b>, and its
        short- to long-term <b>{r.label.toLowerCase()}</b> under a <b style={{ color: "#3fb68b" }}>reserve</b> (let it grow, carbon)
        versus <b style={{ color: "#e6ab02" }}>managed</b> (active harvest, fiber) trajectory. Scrub the stand age or enter your
        measured value to calibrate the curve to your stand. Curves capped at the 100 yr fitted range.
      </div>
    </div>
  );
}
