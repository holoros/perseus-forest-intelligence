// FIA remeasurement AGB yield curves (Researcher tab). Driven by
// api/agb_yield_curves_fia.json (scripts/build_agb_yield_curves.py): generic
// aboveground live tree biomass curves by forest type group and USDA ecological
// section for the six Northern Forest states (ME, NH, VT, MI, WI, MN), 0 to 250 yr
// on a 5 yr grid, with the 95% plot cluster bootstrap band on the median, the mean
// curve, the 90% single plot prediction interval, the cap and the extrapolation
// flag. Small multiples, one inline SVG per type: MiniChart draws one band per
// series only, and these charts need two ribbons plus an extrapolation marker.
import { useMemo, useState } from "react";
import { TYPE_COL, CONTEXT_COL } from "./palette.js";
import { fmtUnit } from "./units.js";

const U = fmtUnit("Mg/ha"); // "Mg ha⁻¹" (thin space, true superscript)
const TYPE_ORDER = ["SF", "MBB", "AB", "OAK", "EAC", "WRPH"];

const fmt0 = v => v == null || !isFinite(v) ? "n/a" : Math.round(v).toLocaleString();
const fmt2 = v => v == null || !isFinite(v) ? "n/a" : v.toFixed(2);
const niceStep = raw => { const mag = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; };
const atAge = (cell, age) => { const i = cell.ages.indexOf(age); return i < 0 ? null : cell.med[i]; };

// One small-multiple panel. Fixed viewBox, width 100% of its grid cell.
function CurvePanel({ code, label, cell, pick }){
  const W = 330, H = 212, P = { l: 44, r: 10, t: 34, b: 28 };
  const col = TYPE_COL[code] || CONTEXT_COL;
  const n = cell.ages.length;
  const top = Math.max(cell.cap || 0, ...cell.hi95.filter(v => v != null), ...cell.mean.filter(v => v != null), 1);
  const ystep = niceStep((top * 1.05) / 4);
  const ymax = Math.ceil((top * 1.05) / ystep) * ystep;
  const sx = a => P.l + (a / 250) * (W - P.l - P.r);
  const sy = v => H - P.b - (Math.min(v, ymax) / ymax) * (H - P.t - P.b);
  const path = (arr) => { let d = "", on = false;
    for(let i = 0; i < n; i++){ const v = arr[i]; if(v == null){ on = false; continue; }
      d += (on ? " L" : " M") + sx(cell.ages[i]).toFixed(1) + " " + sy(v).toFixed(1); on = true; }
    return d.trim(); };
  const ribbon = (lo, hi) => { const idx = []; for(let i = 0; i < n; i++) if(lo[i] != null && hi[i] != null) idx.push(i);
    if(idx.length < 2) return null;
    return "M" + idx.map(i => `${sx(cell.ages[i]).toFixed(1)} ${sy(lo[i]).toFixed(1)}`).join(" L")
      + " L" + idx.slice().reverse().map(i => `${sx(cell.ages[i]).toFixed(1)} ${sy(hi[i]).toFixed(1)}`).join(" L") + " Z"; };
  const yticks = []; for(let v = 0; v <= ymax + 1e-6; v += ystep) yticks.push(v);
  const xticks = [0, 50, 100, 150, 200, 250];
  const firstExtrap = cell.extrap.findIndex(f => f === 1);
  const extrapAge = firstExtrap >= 0 ? cell.ages[firstExtrap] : null;
  const q99 = cell.age_q99 != null ? cell.age_q99 : extrapAge;
  const nplots = cell.n_plots != null ? `${cell.n_plots.toLocaleString()} plots` : "statewide";
  const sub = pick ? `${pick.strat} ${pick.form}${pick.pooled ? " (pooled " + pick.pooled + ")" : ""}` : "";
  const clipId = `agbyc-clip-${code}`;
  return (
    <div className="chartcard" style={{padding:"4px 4px 2px", margin:0}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto", display:"block"}} role="img"
        aria-label={`${label}: AGB yield curve with 95% bootstrap band and 90% prediction interval`}>
        <defs><clipPath id={clipId}><rect x={P.l} y={P.t} width={W-P.l-P.r} height={H-P.t-P.b}/></clipPath></defs>
        {/* Title in ink (AA on both themes) keyed to the series by a swatch, not colored text. */}
        <rect x={P.l} y={4} width={8} height={8} rx={1.5} fill={col}/>
        <text x={P.l+12} y={11.5} className="ch-ttl">{label}</text>
        <text x={P.l} y={24} className="ch-note">{nplots}{sub ? ", " + sub : ""}</text>
        <text transform={`translate(10 ${(P.t+H-P.b)/2}) rotate(-90)`} textAnchor="middle" className="ch-txt">AGB ({U})</text>
        {yticks.map((t, i) => (
          <g key={t}>
            <line x1={P.l} x2={W-P.r} y1={sy(t)} y2={sy(t)} className={i === 0 ? "ch-base" : "ch-grid"}/>
            <text x={P.l-4} y={sy(t)+3.5} textAnchor="end" className="ch-txt">{Math.round(t)}</text>
          </g>))}
        {xticks.map(t => <text key={t} x={sx(t)} y={H-P.b+13} textAnchor="middle" className="ch-txt">{t}</text>)}
        <text x={(P.l+W-P.r)/2} y={H-3} textAnchor="middle" className="ch-txt">Stand age (yr)</text>
        <g clipPath={`url(#${clipId})`}>
          {extrapAge != null && <rect x={sx(extrapAge)} y={P.t} width={Math.max(0, sx(250)-sx(extrapAge))} height={H-P.t-P.b}
            fill="var(--ink)" opacity="0.06"/>}
          {ribbon(cell.pi90_lo, cell.pi90_hi) && <path d={ribbon(cell.pi90_lo, cell.pi90_hi)} fill={col} opacity="0.10"/>}
          {ribbon(cell.lo95, cell.hi95) && <path d={ribbon(cell.lo95, cell.hi95)} fill={col} opacity="0.28"/>}
          {cell.cap != null && <line x1={P.l} x2={W-P.r} y1={sy(cell.cap)} y2={sy(cell.cap)} stroke={col} strokeWidth="0.8" strokeDasharray="1.5 3" opacity="0.8"/>}
          <path d={path(cell.mean)} fill="none" stroke={col} strokeWidth="1.4" strokeDasharray="5 3"/>
          <path d={path(cell.med)} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round"/>
          {q99 != null && <line x1={sx(q99)} x2={sx(q99)} y1={P.t} y2={H-P.b} stroke="var(--ink)" strokeWidth="1" strokeDasharray="2 3" opacity="0.7"/>}
        </g>
        {cell.cap != null && <text x={W-P.r-2} y={sy(cell.cap)-3} textAnchor="end" className="ch-note ch-halo">cap {Math.round(cell.cap)}</text>}
        {q99 != null && (sx(q99) + 118 <= W - P.r
          ? <text x={sx(q99)+3} y={H-P.b-5} className="ch-note ch-halo">extrapolated beyond {Math.round(q99)} yr</text>
          : <text x={sx(q99)-3} y={H-P.b-5} textAnchor="end" className="ch-note ch-halo">extrapolated beyond {Math.round(q99)} yr</text>)}
      </svg>
    </div>
  );
}

export default function AgbYieldCurves({ data, state, stateName }){
  const st = data && data.states && data.states[state];
  const [section, setSection] = useState("ALL");
  const sections = useMemo(() => st ? Object.keys(st.sections) : [], [st]);
  const sec = st && (st.sections[section] || st.sections.ALL || st.sections[sections[0]]);
  const secKey = sec ? (st.sections[section] ? section : (st.sections.ALL ? "ALL" : sections[0])) : null;
  if(!data) return <div className="empty">FIA AGB yield curves not loaded.</div>;
  if(!st) return <div className="empty">No FIA remeasurement AGB yield curves for {stateName || state}. Curves exist for ME, NH, VT, MI, WI and MN.</div>;

  const typeLabel = code => (data.type_labels && data.type_labels[state] && data.type_labels[state][code]) || data.types[code] || code;
  const types = TYPE_ORDER.filter(t => sec.types[t]);
  const src = data.sources[state] || {};
  // Section codes are USDA Forest Service ecological sections (ECOSUBCD); the inputs carry codes only.
  const secName = k => k === "ALL" ? "Statewide (all sections)" : `Section ${k}`;

  function downloadCsv(){
    const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const L = [];
    L.push(`# PERSEUS FIA remeasurement AGB yield curves (${data.schema})`);
    L.push(`# state,${state}`);
    L.push(`# generated,${data.generated}`);
    L.push(`# unit,${q(data.unit)}`);
    L.push(`# source,${q(src.label || "")}`);
    if(src.doi) L.push(`# doi,https://doi.org/${src.doi}`);
    L.push(`# status,${q(src.status || "")}`);
    L.push(`# method,${q(data.method)}`);
    (data.notes || []).filter(n => n.startsWith(state) || n.includes(state + ",") || n.includes(", " + state)).forEach(n => L.push(`# note,${q(n)}`));
    L.push("section,type,type_label,strategy,form,basis,n_plots,cap_Mg_ha,age_q99_yr,age_yr,agb_median,agb_mean,lo95,hi95,pi90_lo,pi90_hi,capped,extrapolated");
    Object.entries(st.sections).forEach(([sk, s]) => {
      TYPE_ORDER.filter(t => s.types[t]).forEach(t => {
        const c = s.types[t], p = st.picks[t] || {};
        c.ages.forEach((a, i) => L.push([sk, t, q(typeLabel(t)), p.strat ?? "", p.form ?? "", q(p.basis ?? ""), c.n_plots ?? "",
          c.cap ?? "", c.age_q99 ?? "", a, c.med[i] ?? "", c.mean[i] ?? "", c.lo95[i] ?? "", c.hi95[i] ?? "",
          c.pi90_lo[i] ?? "", c.pi90_hi[i] ?? "", c.capped[i], c.extrap[i]].join(",")));
      });
    });
    const blob = new Blob([L.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `perseus_agb_yield_curves_${state}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{margin:"4px 4px 8px"}}>
      <div className="pn-head" style={{justifyContent:"space-between", alignItems:"center"}}>
        <span style={{display:"inline-flex", alignItems:"baseline", gap:8, flexWrap:"wrap"}}>
          <h3 className="pn-h">FIA remeasurement AGB yield curves</h3>
          <span className="pn-meta">{stateName || state}, {types.length} forest type groups, {sections.length - (st.sections.ALL ? 1 : 0)} ecological sections</span>
        </span>
        <span style={{display:"inline-flex", gap:6, alignItems:"center"}}>
          <select className="pn-sel" value={secKey} onChange={e => setSection(e.target.value)} title="USDA Forest Service ecological section; statewide is the section ALL curve">
            {sections.map(k => <option key={k} value={k}>{secName(k)}</option>)}
          </select>
          <button className="pn-btn ch-btn" style={{whiteSpace:"nowrap"}} onClick={downloadCsv}
            title={`Download every ${state} curve (all sections, 5 yr grid) as CSV with a provenance header`}>Download CSV</button>
        </span>
      </div>
      {/* Caption line naming every mark and band drawn in the small multiples. */}
      <div className="pn-key" style={{margin:"0 0 8px", fontSize:11.5}}>
        <span><i className="pn-sw" style={{background:"var(--ink)", width:14, height:2, borderRadius:0}}/>median (typical plot)</span>
        <span><svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="4 2"/></svg>mean (population input)</span>
        <span><i className="pn-sw" style={{background:"var(--ink)", opacity:0.28, width:14, height:9}}/>95% bootstrap band on the median</span>
        <span><i className="pn-sw" style={{background:"var(--ink)", opacity:0.10, width:14, height:9}}/>90% prediction interval, single plot</span>
        <span><i className="pn-sw" style={{background:"var(--ink)", opacity:0.12, width:14, height:9}}/>beyond the 99th percentile age (extrapolated)</span>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(290px, 1fr))", gap:8}}>
        {types.map(t => <CurvePanel key={t} code={t} label={typeLabel(t)} cell={sec.types[t]} pick={st.picks[t]}/>)}
      </div>

      <p className="tbl-cap" style={{marginTop:12}}><b>Chosen form, cap and median AGB by age</b>, {secName(secKey)}</p>
      <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>
          <th className="pn-left">Type</th>
          <th title="Strategy (S1 remeasurement only; S2 joint chronosequence plus repeated measures) and form (CR, CRS, CRD, HG)">Form</th>
          <th title="Observed 99th percentile AGB for the type; every curve is held at or below it">Cap ({U})</th>
          <th title="99th percentile observed stand age for this cell; curves beyond it are extrapolations">99th pct age (yr)</th>
          <th title="Bootstrap probability that the median curve peaks before 250 yr">P(peak &lt; 250 yr)</th>
          <th>Median 50 yr ({U})</th>
          <th>Median 100 yr ({U})</th>
          <th>Median 150 yr ({U})</th>
        </tr></thead>
        <tbody>{types.map(t => { const c = sec.types[t], p = st.picks[t] || {}, d = st.decline[t];
          return (
          <tr key={t}>
            <td className="pn-left" style={{whiteSpace:"nowrap"}}><span className="pn-th-sw"><i className="pn-sw" aria-hidden="true" style={{background:TYPE_COL[t] || CONTEXT_COL}}/>{typeLabel(t)}</span></td>
            <td style={{whiteSpace:"nowrap"}} title={p.basis || ""}>{p.strat || "n/a"} {p.form || ""}{p.pooled ? ` (${p.pooled})` : ""}{/screen|fallback|held at cap/i.test(p.basis || "") ? "*" : ""}</td>
            <td>{fmt0(c.cap)}</td>
            <td>{c.age_q99 != null ? fmt0(c.age_q99) : "n/a"}</td>
            <td title={d ? `${d.nboot} bootstrap draws${d.dropped_early ? ", " + d.dropped_early + " dropped by the early rise screen" : ""}` : "no bootstrap decline summary"}>{d ? fmt2(d.p_decline_250) : "n/a"}</td>
            <td>{fmt0(atAge(c, 50))}</td>
            <td>{fmt0(atAge(c, 100))}</td>
            <td>{fmt0(atAge(c, 150))}</td>
          </tr>); })}
        </tbody>
      </table>
      </div>

      <div className="pn-note">
        <b>Read these as population curves.</b> The median is the typical plot and the mean (dashed) is the right input for
        population totals; the shaded band is the 95% plot cluster bootstrap interval on the median (200 draws) and the lighter
        ribbon is the 90% prediction interval for a single plot. Every curve is held at the type cap (observed 99th percentile AGB)
        and is an extrapolation beyond the cell's 99th percentile stand age (dotted line, grey shading). Equivalence tests on
        annual net change fail the slope test for every candidate form, so the curves have no plot level skill for net change.
        Curve implied net growth also runs low: about 40% below EVALIDator net for NH and VT ("curve implied net growth is
        about 40% below EVALIDator net"), and 60 to 64% of EVALIDator net for MI, WI and MN ("net growth implied by age only
        curves is 60 to 64% of EVALIDator net"), while curve implied stock comes within 2 to 4% (Lake States) and 3% (NH, VT) of
        EVALIDator. Annual flux from these curves will therefore run low.
        {" "}* form chosen under a relaxed screen, a fallback or held at the cap; hover the cell for the basis.
        {state === "MN" && <> Minnesota maple-beech-birch and oak are the Lake States pooled fit (LSPOOL), limited to Minnesota cells and re-capped at the Minnesota 99th percentile, because the Minnesota state fits failed the early rise screen.</>}
        {(state === "NH" || state === "VT") && <> NH and VT shapes were fitted pooled with a state level effect (NH about 5% above VT); elm-ash-cottonwood was dropped under the 50 plot thin rule.</>}
        {" "}Unit: {U}, aboveground live tree biomass (FIADB DRYBIO_AG). Section ALL is the statewide curve.
        {" "}Source: {src.doi
          ? <><a href={`https://doi.org/${src.doi}`} target="_blank" rel="noopener noreferrer">{src.label}</a> (doi:{src.doi}, {src.status}).</>
          : <>{src.label} ({src.status}; same method as the Maine record, <a href="https://doi.org/10.5281/zenodo.23406410" target="_blank" rel="noopener noreferrer">doi:10.5281/zenodo.23406410</a>).</>}
        {" "}Data: api/agb_yield_curves_fia.json.
      </div>
    </div>
  );
}
