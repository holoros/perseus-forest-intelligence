// Wood products carbon tab (Researcher). Driven by the per-state series store
// (api/series/<ST>.json), not a separate file:
//   net_forest_hwp_c   forest + wood products in use + landfill, by scenario
//                      (model yc_hwp_v1, first-order-decay HWP on the hybrid engine)
//   hwp_carbon_stock   HWP pool alone (in use + landfill), CBM pathway
//   net_climate_carbon ecosystem additionality + HWP storage, CBM pathway
// Labels and units come from api/meta.json. Supersedes the experimental
// hwp_storage.json layer from PR #26 (different pool model, displacement factor
// and magnitudes; see the hybrid-production-hwp methods note).
import MiniChart from "./MiniChart.jsx";
import { conv, unitLabel } from "./units.js";

const BASE = import.meta.env.BASE_URL;
// Okabe-Ito scenario colors (categorical), ordered from no harvest to intensive harvest.
const SCEN = [
  { key: "reserve (no harvest)",   short: "Reserve",      color: "#009E73" },
  { key: "managed (conservation)", short: "Conservation", color: "#56B4E9" },
  { key: "managed (harvest)",      short: "Harvest",      color: "#E69F00" },
  { key: "managed (intensive)",    short: "Intensive",    color: "#D55E00" },
];
// House table on main and taste alike: centered cells, bold centered header, three rules
// (above header, below header, below last row), no interior rules. so-table carries the
// taste-ui hover tint; the inline rules override main's right-aligned, ruled rows.
const RULE = "1px solid var(--line-strong, var(--line))";
const TBL = { margin:"10px 8px 0", width:"calc(100% - 16px)", borderCollapse:"collapse",
  borderTop:RULE, borderBottom:RULE, fontVariantNumeric:"tabular-nums" };
const TH = { textAlign:"center", verticalAlign:"middle", fontWeight:700, color:"var(--ink)",
  padding:"4px 6px", borderBottom:RULE };
const TD = { textAlign:"center", verticalAlign:"middle", padding:"3px 6px", borderBottom:"none", color:"var(--ink)" };
const CAP = { captionSide:"top", textAlign:"left", fontSize:12, color:"var(--ink-2, var(--mut))", padding:"0 0 6px" };

// Series-store points are [year, v] or [year, lo, mid, hi]; MiniChart wants 4-tuples.
const toPts = pts => (pts || []).filter(p => p && (p.length === 2 ? p[1] != null : p[2] != null))
  .map(p => p.length === 2 ? [p[0], null, p[1], null] : p);
const val = p => p.length === 2 ? p[1] : p[2];

// First entry for a metric/bucket, preferring a given model.
function pick(series, metric, bucket, model){
  const lst = series && series[metric] && series[metric][bucket];
  if(!lst || !lst.length) return null;
  return (model && lst.find(e => e.model === model)) || lst[0];
}
function endPoint(entry){
  const pts = entry ? toPts(entry.pts) : [];
  return pts.length ? pts[pts.length - 1] : null;
}
const fmt = v => v == null || !isFinite(v) ? "n/a"
  : (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1));
const signed = v => v == null || !isFinite(v) ? "n/a" : (v > 0 ? "+" : "") + fmt(v);

export default function WoodProducts({ series, meta, state, units = "imperial" }){
  if(!series) return <div className="empty">Series for {state} not loaded.</div>;
  const has = m => !!(series[m] && Object.keys(series[m]).length);
  if(!has("net_forest_hwp_c") && !has("hwp_carbon_stock"))
    return <div className="empty">No wood products carbon series for {state}.</div>;

  const mm = k => (meta && meta.metrics && meta.metrics[k]) || { label: k, unit: "Tg C" };
  // Tg C is already SI; conv/unitLabel pass it through under either toggle setting.
  const u = k => unitLabel(mm(k).unit, units);
  const cv = (v, k) => conv(v, mm(k).unit, units).value;

  // Panel 1: forest + HWP + landfill net stock by scenario.
  const netEntries = SCEN.map(s => ({ s, e: pick(series, "net_forest_hwp_c", s.key, "yc_hwp_v1") }))
    .filter(x => x.e);
  const netSeries = netEntries.map(({ s, e }) => ({ label: s.short, color: s.color,
    pts: toPts(e.pts).map(([x, lo, mid, hi]) => [x, lo, cv(mid, "net_forest_hwp_c"), hi]) }));
  const resEnd = endPoint(pick(series, "net_forest_hwp_c", "reserve (no harvest)", "yc_hwp_v1"));

  // Panel 2: HWP pool alone (whatever scenarios the store carries).
  const hwpSeries = SCEN.map(s => ({ s, e: pick(series, "hwp_carbon_stock", s.key) }))
    .filter(x => x.e)
    .map(({ s, e }) => ({ label: s.short, color: s.color,
      pts: toPts(e.pts).map(([x, lo, mid, hi]) => [x, lo, cv(mid, "hwp_carbon_stock"), hi]) }));

  // Summary table at the end of each projection.
  const rows = SCEN.map(s => {
    const n = pick(series, "net_forest_hwp_c", s.key, "yc_hwp_v1");
    const np = n ? toPts(n.pts) : [];
    const n0 = np.length ? val(np[0]) : null, n1 = np.length ? val(np[np.length - 1]) : null;
    const h = endPoint(pick(series, "hwp_carbon_stock", s.key));
    const c = endPoint(pick(series, "net_climate_carbon", s.key, "yc_fia_empirical_v1"));
    return { s, n0, n1, nYear: np.length ? np[np.length - 1][0] : null,
      vsRes: (n1 != null && resEnd && s.key !== "reserve (no harvest)") ? n1 - val(resEnd) : null,
      h: h ? val(h) : null, hYear: h ? h[0] : null,
      c: c ? val(c) : null, cYear: c ? c[0] : null };
  }).filter(r => r.n1 != null || r.h != null || r.c != null);
  const yr = k => { const ys = [...new Set(rows.map(r => r[k]).filter(Boolean))]; return ys.length ? ys.join(" and ") : ""; };

  return (
    <div>
      <div className="controls" style={{marginTop:0}}>
        <span style={{color:"var(--mut)",fontSize:12,alignSelf:"center"}}>
          {mm("net_forest_hwp_c").label} ({u("net_forest_hwp_c")})</span>
      </div>
      {netSeries.length ? (
        <div className="chartcard" style={{padding:"6px 8px"}}>
          <MiniChart series={netSeries} unit={`Carbon stock (${u("net_forest_hwp_c")})`} xlabel="Year"/>
        </div>
      ) : <div className="note">No forest + wood products series for {state}.</div>}
      <div className="lgd" style={{marginTop:8}}>
        {netEntries.map(({ s }) => <span key={s.key}><i style={{background:s.color,width:14,height:3}}/>{s.key}</span>)}
      </div>

      {hwpSeries.length > 0 && (<>
        <div className="controls">
          <span style={{color:"var(--mut)",fontSize:12,alignSelf:"center"}}>
            {mm("hwp_carbon_stock").label} ({u("hwp_carbon_stock")}), CBM pathway</span>
        </div>
        <div className="chartcard" style={{padding:"6px 8px"}}>
          <MiniChart series={hwpSeries} unit={`Carbon stock (${u("hwp_carbon_stock")})`} xlabel="Year" height={170}/>
        </div>
      </>)}

      {rows.length > 0 && (
        <table className="so-table" style={TBL}>
          <caption style={CAP}><b style={{color:"var(--ink)"}}>Carbon by scenario at the end of each projection</b>, state totals</caption>
          <thead><tr>
            <th style={TH}>Scenario</th>
            <th style={TH} title={mm("net_forest_hwp_c").label}>Forest + HWP {yr("nYear")} ({u("net_forest_hwp_c")})</th>
            <th style={TH}>Change since start ({u("net_forest_hwp_c")})</th>
            <th style={TH}>vs reserve ({u("net_forest_hwp_c")})</th>
            <th style={TH} title={mm("hwp_carbon_stock").label}>HWP pool {yr("hYear")} ({u("hwp_carbon_stock")})</th>
            <th style={TH} title={mm("net_climate_carbon").label}>Net climate C {yr("cYear")} ({u("net_climate_carbon")})</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.s.key}>
              <td style={TD}><i aria-hidden="true" style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:r.s.color,marginRight:5}}/>{r.s.key}</td>
              <td style={TD}>{fmt(cv(r.n1, "net_forest_hwp_c"))}</td>
              <td style={TD}>{r.n0 != null && r.n1 != null ? signed(cv(r.n1 - r.n0, "net_forest_hwp_c")) : "n/a"}</td>
              <td style={TD}>{r.vsRes != null ? signed(cv(r.vsRes, "net_forest_hwp_c")) : "n/a"}</td>
              <td style={TD}>{fmt(cv(r.h, "hwp_carbon_stock"))}</td>
              <td style={TD}>{signed(cv(r.c, "net_climate_carbon"))}</td>
            </tr>))}
          </tbody>
        </table>
      )}

      <div className="note">
        All values are state totals in {u("net_forest_hwp_c")} (teragrams of carbon; 1 Tg = 10<sup>12</sup> g).
        The top chart is net system carbon: standing live carbon plus wood products in use plus
        landfill, from an IPCC-style first-order-decay pool on the hybrid yield engine
        (sawtimber half-life 35 yr, pulpwood 2 yr, 30% of retired products to landfill with a
        100 yr half-life). The HWP pool and net climate carbon columns come from the CBM pathway
        and use a different engine and start year, so compare them within a column, not across.
        Avoided emissions from product substitution are not a carbon stock and are not published
        per state; the methods note reports them only as a CONUS sensitivity.
        Method: <a href={`${BASE}methods/hybrid-production-hwp/`} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent)"}}>hybrid in production + harvested wood products</a>.
        Data: api/series/{state}.json (net_forest_hwp_c, hwp_carbon_stock, net_climate_carbon).
      </div>
    </div>
  );
}
