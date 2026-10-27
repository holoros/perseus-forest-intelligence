// Relative density thresholds by forest type and EPA Level III ecoregion, shown
// under the RD trend chart. Driven by api/rd_thresholds_l3.json
// (scripts/build_rd_thresholds.py, from Supplementary Data S1 of Chivhenge et al.,
// submitted to Forest Ecology and Management; concept DOI 10.5281/zenodo.23397937).
// The series chart above plots a weighted plot mean RD per state; these are the
// breakpoints in projected RD at which gross growth, net growth, mortality
// incidence and mortality severity change regime, per type and ecoregion.
import { useMemo, useState } from "react";

const RULE = "1px solid var(--line-strong, var(--line))";
const TBL = { margin:"10px 8px 0", width:"calc(100% - 16px)", borderCollapse:"collapse",
  borderTop:RULE, borderBottom:RULE, fontVariantNumeric:"tabular-nums", fontSize:12 };
const TH = { textAlign:"center", verticalAlign:"middle", fontWeight:700, color:"var(--ink)",
  padding:"4px 6px", borderBottom:RULE };
const TD = { textAlign:"center", verticalAlign:"middle", padding:"3px 6px", borderBottom:"none", color:"var(--ink)" };
const CAP = { captionSide:"top", textAlign:"left", fontSize:12, color:"var(--ink-2, var(--mut))", padding:"0 0 6px" };

const f2 = v => v == null ? "n/a" : v.toFixed(2);
const Cell = ({ v, src }) => v && v[0] != null
  ? <td style={{...TD, whiteSpace:"nowrap"}} title={`${v[0].toFixed(3)} (95% interval ${v[1] != null ? v[1].toFixed(3) : "n/a"} to ${v[2] != null ? v[2].toFixed(3) : "n/a"})`}>
      {f2(v[0])} <span style={{color:"var(--mut)", fontSize:10.5}}>({f2(v[1])} to {f2(v[2])})</span><sup style={{color:"var(--mut)", fontSize:9, marginLeft:2}}>{src}</sup>
    </td>
  : <td style={TD}>n/a</td>;

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

  return (
    <div style={{marginTop:10}}>
      <div className="who" style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap"}}>
        <span><b>RD thresholds by forest type and ecoregion</b>{" "}
          <span style={{color:"var(--mut)"}}>· {codes.length} EPA Level III ecoregions intersect {stateName || state}</span></span>
        {codes.length > 0 && <select value={code} onChange={e => setPick(e.target.value)} title="EPA Level III ecoregion">
          {codes.map(c => <option key={c} value={c}>{c} · {data.l3[c] ? data.l3[c].name : c}</option>)}
        </select>}
      </div>
      <div className="chartcard" style={{padding:"8px 10px", marginBottom:6}}>
        <div style={{display:"flex", gap:14, flexWrap:"wrap", alignItems:"baseline"}}>
          {[["Gross growth", nat.gross_growth, null], ["Net growth", nat.net_growth, nat.net_growth_profile_interval],
            ["Mortality incidence", nat.mortality_incidence, null], ["Mortality severity", nat.mortality_severity, null]].map(([l, v, iv]) => (
            <span key={l}><span style={{color:"var(--mut)", fontSize:11.5}}>{l} </span>
              <b style={{fontSize:14, fontVariantNumeric:"tabular-nums"}}>{v != null ? v.toFixed(2) : "n/a"}</b>
              {iv && <span style={{color:"var(--mut)", fontSize:11}}> (profile interval {f2(iv[0])} to {f2(iv[1])})</span>}</span>))}
        </div>
        <div style={{color:"var(--mut)", fontSize:11.5, marginTop:4}}>
          National breakpoints in projected RD, all types pooled. Pooled type by ecoregion cell means: gross {nat.pooled_cells ? nat.pooled_cells.gross.mean.toFixed(3) : "n/a"} ({nat.pooled_cells ? nat.pooled_cells.gross.n_cells : "n/a"} cells; 95% prediction interval for a new cell {nat.pooled_cells ? `${f2(nat.pooled_cells.gross.pi95_new_cell[0])} to ${f2(nat.pooled_cells.gross.pi95_new_cell[1])}` : "n/a"}) and
          net {nat.pooled_cells ? nat.pooled_cells.net.mean.toFixed(3) : "n/a"} ({nat.pooled_cells ? nat.pooled_cells.net.n_cells : "n/a"} cells; {nat.pooled_cells ? `${f2(nat.pooled_cells.net.pi95_new_cell[0])} to ${f2(nat.pooled_cells.net.pi95_new_cell[1])}` : "n/a"}).
          The RD series in the chart above is a weighted plot mean for the state, not a stand value; compare it with these thresholds only as a regional tendency.
        </div>
      </div>
      {!eco && <div className="note">No ecoregion thresholds mapped for {stateName || state}.</div>}
      {eco && (<>
        <label style={{display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color:"var(--mut)", margin:"0 8px"}}>
          <input type="checkbox" checked={hideThin} onChange={e => setHideThin(e.target.checked)}/> hide pooled-only thin cells (source po on every column)
        </label>
        <table className="so-table" style={TBL}>
          <caption style={CAP}><b style={{color:"var(--ink)"}}>Breakpoints in projected RD, {code} {eco.name}</b> ({eco.l2}), by forest type group and type; value (95% interval), source code superscript</caption>
          <thead><tr>
            <th style={{...TH, textAlign:"left"}}>Forest type</th>
            <th style={TH} title="Remeasurement pairs in the cell">Pairs</th>
            <th style={TH} title="Gross growth breakpoint in projected RD">Gross growth</th>
            <th style={TH} title="Net growth breakpoint in projected RD">Net growth</th>
            <th style={TH} title="Mortality incidence breakpoint in projected RD">Mortality incidence</th>
            <th style={TH} title="Mortality severity breakpoint in projected RD">Mortality severity</th>
          </tr></thead>
          <tbody>{groups.map(g => {
            const rows = hideThin ? g.rows.filter(r => !isThin(r)) : g.rows;
            if(!rows.length) return null;
            return [
              <tr key={"g"+g.ftg}><td colSpan={6} style={{...TD, textAlign:"left", fontWeight:700, paddingTop:6, color:"var(--ink-2, var(--ink))"}}>{g.tg} <span style={{color:"var(--mut)", fontWeight:400}}>(group {g.ftg}, {g.pairs.toLocaleString()} pairs)</span></td></tr>,
              ...rows.map(r => (
                <tr key={r.ft}>
                  <td style={{...TD, textAlign:"left", paddingLeft:16, fontSize:11.5}}>{r.ftn} <span style={{color:"var(--mut)"}}>({r.ft})</span></td>
                  <td style={TD}>{r.pairs.toLocaleString()}</td>
                  <Cell v={r.g} src={r.src.g}/><Cell v={r.n} src={r.src.n}/><Cell v={r.inc} src={r.src.inc}/><Cell v={r.sev} src={r.src.sev}/>
                </tr>))];
          })}</tbody>
        </table>
      </>)}
      <div className="note">
        Source codes: {Object.entries(legend).map(([k, v], i) => <span key={k}>{i ? "; " : ""}<sup>{k}</sup> {v}</span>)}.
        {" "}Thresholds are breakpoints in projected relative density (RD) estimated from FIA remeasurement pairs, per EPA Level III ecoregion and FIA forest type; thin cells carry the pooled type by ecoregion value.
        Ecoregions listed for a state are those whose Level III polygon intersects the state outline (computed at build time from the repo geojson), so a listed ecoregion may hold little of the state's forest.
        {" "}Source: {data.source && data.source.citation}{" "}
        <a href={`https://doi.org/${data.source && data.source.doi}`} target="_blank" rel="noopener noreferrer" style={{color:"var(--accent)"}}>doi:{data.source && data.source.doi}</a> (concept DOI; Supplementary Data S1).
        Data: api/rd_thresholds_l3.json.
      </div>
    </div>
  );
}
