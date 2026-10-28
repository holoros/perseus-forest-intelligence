// Relative density thresholds by forest type and EPA Level III ecoregion, shown
// under the RD trend chart. Driven by api/rd_thresholds_l3.json
// (scripts/build_rd_thresholds.py, from Supplementary Data S1 of Chivhenge et al.,
// submitted to Forest Ecology and Management; concept DOI 10.5281/zenodo.23397937).
// The series chart above plots a weighted plot mean RD per state; these are the
// breakpoints in projected RD at which gross growth, net growth, mortality
// incidence and mortality severity change regime, per type and ecoregion.
import { useMemo, useState } from "react";

const f2 = v => v == null ? "n/a" : v.toFixed(2);
// Value, its 95% interval in the muted ink, and the source code as a superscript.
const Cell = ({ v, src }) => v && v[0] != null
  ? <td title={`${v[0].toFixed(3)} (95% interval ${v[1] != null ? v[1].toFixed(3) : "n/a"} to ${v[2] != null ? v[2].toFixed(3) : "n/a"})`}>
      {f2(v[0])} <span className="pn-iv" style={{whiteSpace:"nowrap"}}>({f2(v[1])} to {f2(v[2])})<sup>{src}</sup></span>
    </td>
  : <td>n/a</td>;

export default function RdThresholds({ data, state, stateName }){
  const codes = (data && data.state_l3 && data.state_l3[state]) || [];
  const [pick, setPick] = useState(null);
  const [hideThin, setHideThin] = useState(false);
  const code = codes.includes(pick) ? pick : codes[0];
  const eco = data && code ? data.l3[code] : null;
  const groups = useMemo(() => {
    if(!eco) return [];
    const by = new Map();
    eco.types.forEach(t => { if(!by.has(t.ftg)) by.set(t.ftg, { ftg:t.ftg, tg:t.tg, rows:[] }); by.get(t.ftg).rows.push(t); });
    const out = [...by.values()];
    out.forEach(g => { g.rows.sort((a,b) => b.pairs - a.pairs); g.pairs = g.rows.reduce((s,r) => s + r.pairs, 0); });
    out.sort((a,b) => b.pairs - a.pairs);
    return out;
  }, [eco]);
  if(!data) return null;
  const nat = data.national || {};
  const isThin = r => r.src && r.src.g === "po" && r.src.n === "po" && r.src.inc === "po" && r.src.sev === "po";
  const legend = data.source_codes || {};

  const pc = nat.pooled_cells;
  return (
    <div style={{margin:"14px 4px 8px"}}>
      <div className="pn-head" style={{justifyContent:"space-between", alignItems:"center"}}>
        <span style={{display:"inline-flex", alignItems:"baseline", gap:8, flexWrap:"wrap"}}>
          <h3 className="pn-h">RD thresholds by forest type and ecoregion</h3>
          <span className="pn-meta">{codes.length} EPA Level III ecoregions intersect {stateName || state}</span>
        </span>
        {codes.length > 0 && <select className="pn-sel" value={code} onChange={e => setPick(e.target.value)} title="EPA Level III ecoregion">
          {codes.map(c => <option key={c} value={c}>{c}, {data.l3[c] ? data.l3[c].name : c}</option>)}
        </select>}
      </div>
      <div className="pn-panel">
        <div className="pn-stats">
          {[["Gross growth", nat.gross_growth, null], ["Net growth", nat.net_growth, nat.net_growth_profile_interval],
            ["Mortality incidence", nat.mortality_incidence, null], ["Mortality severity", nat.mortality_severity, null]].map(([l, v, iv]) => (
            <div key={l} className="pn-stat">
              <span className="eyebrow">{l}</span>
              <b>{v != null ? v.toFixed(2) : "n/a"}<small>RD</small></b>
              {iv && <span>profile interval {f2(iv[0])} to {f2(iv[1])}</span>}
            </div>))}
        </div>
        <p className="pn-cap" style={{marginTop:12}}>
          National breakpoints in projected relative density (RD), all types pooled. Pooled type by ecoregion cell means: gross {pc ? pc.gross.mean.toFixed(3) : "n/a"} ({pc ? pc.gross.n_cells : "n/a"} cells; 95% prediction interval for a new cell {pc ? `${f2(pc.gross.pi95_new_cell[0])} to ${f2(pc.gross.pi95_new_cell[1])}` : "n/a"}) and
          net {pc ? pc.net.mean.toFixed(3) : "n/a"} ({pc ? pc.net.n_cells : "n/a"} cells; {pc ? `${f2(pc.net.pi95_new_cell[0])} to ${f2(pc.net.pi95_new_cell[1])}` : "n/a"}).
          The RD series in the chart above is a weighted plot mean for the state, not a stand value; compare it with these thresholds only as a regional tendency.
        </p>
      </div>
      {!eco && <p className="pn-note">No ecoregion thresholds mapped for {stateName || state}.</p>}
      {eco && (<>
        <label style={{display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color:"var(--mut)", margin:"0 0 6px"}}>
          <input type="checkbox" checked={hideThin} onChange={e => setHideThin(e.target.checked)}/> hide pooled-only thin cells (source po on every column)
        </label>
        <p className="tbl-cap"><b>Breakpoints in projected RD, {code} {eco.name}</b> ({eco.l2}), by forest type group and type; value (95% interval), source code superscript</p>
        <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th className="pn-left">Forest type (FIA code)</th>
            <th title="Remeasurement pairs in the cell">Pairs (n)</th>
            <th title="Gross growth breakpoint in projected RD">Gross growth (RD)</th>
            <th title="Net growth breakpoint in projected RD">Net growth (RD)</th>
            <th title="Mortality incidence breakpoint in projected RD">Mortality incidence (RD)</th>
            <th title="Mortality severity breakpoint in projected RD">Mortality severity (RD)</th>
          </tr></thead>
          <tbody>{groups.map(g => {
            const rows = hideThin ? g.rows.filter(r => !isThin(r)) : g.rows;
            if(!rows.length) return null;
            return [
              <tr key={"g"+g.ftg} className="pn-group"><td colSpan={6}>{g.tg} <span>(group {g.ftg}, {g.pairs.toLocaleString()} pairs)</span></td></tr>,
              ...rows.map(r => (
                <tr key={r.ft}>
                  <td className="pn-left" style={{paddingLeft:16, minWidth:150}}>{r.ftn} <span style={{color:"var(--mut)"}}>({r.ft})</span></td>
                  <td>{r.pairs.toLocaleString()}</td>
                  <Cell v={r.g} src={r.src.g}/><Cell v={r.n} src={r.src.n}/><Cell v={r.inc} src={r.src.inc}/><Cell v={r.sev} src={r.src.sev}/>
                </tr>))];
          })}</tbody>
        </table>
        </div>
      </>)}
      <p className="pn-note">
        Source codes: {Object.entries(legend).map(([k, v], i) => <span key={k}>{i ? "; " : ""}<sup>{k}</sup> {v}</span>)}.
        {" "}Thresholds are breakpoints in projected relative density (RD) estimated from FIA remeasurement pairs, per EPA Level III ecoregion and FIA forest type; thin cells carry the pooled type by ecoregion value.
        Ecoregions listed for a state are those whose Level III polygon intersects the state outline (computed at build time from the repo geojson), so a listed ecoregion may hold little of the state's forest.
        {" "}Source: {data.source && data.source.citation}{" "}
        <a href={`https://doi.org/${data.source && data.source.doi}`} target="_blank" rel="noopener noreferrer">doi:{data.source && data.source.doi}</a> (concept DOI; Supplementary Data S1).
        Data: api/rd_thresholds_l3.json.
      </p>
    </div>
  );
}
