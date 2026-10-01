// Engine-spread heatmap. Reconstructed into source (v1.3 parity) from
// api/engine_divergence.json. Rows = states sorted by coefficient of
// variation (widest engine disagreement first); columns = engines; each
// cell colored by percent deviation from that state's cross-engine mean.
import { useState } from "react";
import { fmtUnit } from "./units.js";

const fmtLabel = s => typeof s !== "string" ? s
  : s.replace(/(?<![A-Za-z])((?:\$|[A-Za-z]{1,3})(?: C)?)\/([A-Za-z]{1,3})(?:\/([A-Za-z]{1,3}))?(?![A-Za-z])/g, m => fmtUnit(m));

// Diverging color (ColorBrewer RdBu ends, colorblind safe): below-mean (less carbon) -> blue,
// above-mean -> red, near-mean -> the theme's panel-2 tone, so the neutral middle reads as
// "no signal" on both light and dark backgrounds.
const DV_LO = "#2166AC", DV_HI = "#B2182B";
function devStrength(pct){ return Math.min(1, Math.abs(pct / 100)); } // clamp to +/-100%
function devColor(pct){
  if(pct == null || !isFinite(pct)) return null;
  const a = devStrength(pct);
  const end = pct < 0 ? DV_LO : DV_HI;
  return `color-mix(in oklab, ${end} ${Math.round(a * 100)}%, var(--panel-2))`;
}
const devInk = pct => devStrength(pct) > 0.5 ? "#FFFFFF" : "var(--ink)";
const shortEngine = (e) => e
  .replace(/^cem_/, "cem·").replace(/^fvs_/, "fvs·")
  .replace(/_/g, " ").replace(/cross state/, "x-state");

export default function DivergenceHeatmap({ data, onPickState, selected }){
  const [showVal, setShowVal] = useState(false); // false = % dev, true = raw value
  if(!data || !data.meta || !data.states)
    return <div className="empty">Engine-spread data not loaded.</div>;
  const { meta, states } = data;
  const engines = meta.engines || [];
  const rows = Object.keys(states)
    .map(st => ({ st, ...states[st] }))
    .sort((a,b) => (b.cv||0) - (a.cv||0));

  return (
    <div>
      <div className="controls" style={{marginTop:0}}>
        <span style={{color:"var(--mut)",fontSize:12.5,alignSelf:"center"}}>
          {fmtLabel(meta.metric_label)} · {meta.bucket} · year {meta.target_year}
        </span>
        <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--mut)"}}>
          <input type="checkbox" checked={showVal} onChange={e=>setShowVal(e.target.checked)}/>
          show raw values
        </label>
      </div>
      <div className="chartcard" style={{overflowX:"auto",padding:"8px"}}>
        <table className="dv-tbl">
          <thead>
            <tr>
              <th style={{position:"sticky",left:0,background:"var(--panel)",zIndex:2,
                          textAlign:"left",padding:"3px 8px"}}>state</th>
              <th style={{padding:"3px 6px"}}>n</th>
              <th style={{padding:"3px 6px"}}>mean</th>
              <th style={{padding:"3px 6px"}}>CV</th>
              <th style={{padding:"3px 6px"}}>spread %</th>
              {engines.map(e =>
                <th key={e} title={e} style={{padding:"3px 4px",
                    writingMode:"vertical-rl",transform:"rotate(180deg)",
                    whiteSpace:"nowrap",fontWeight:400,maxHeight:120}}>{shortEngine(e)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.st}>
                <td onClick={()=> onPickState && onPickState(r.st)}
                    title="jump to this state"
                    style={{position:"sticky",left:0,zIndex:1,
                            background: r.st===selected ? "var(--accent-tint)" : "var(--panel)",
                            cursor:"pointer",padding:"3px 8px",whiteSpace:"nowrap",
                            fontWeight: r.st===selected?700:400,
                            borderLeft: r.st===selected?"2px solid var(--accent)":"2px solid transparent"}}>
                  {r.st} · {r.name}
                </td>
                <td style={{padding:"3px 6px",color:"var(--mut)",textAlign:"right"}}>{r.n_engines}</td>
                <td style={{padding:"3px 6px",textAlign:"right"}}>{r.mean!=null?r.mean.toFixed(0):"·"}</td>
                <td style={{padding:"3px 6px",textAlign:"right",
                            color: r.cv>0.5?"var(--alert)":"var(--ink)",
                            fontWeight: r.cv>0.5?700:400}}>{r.cv!=null?r.cv.toFixed(2):"·"}</td>
                <td style={{padding:"3px 6px",textAlign:"right",color:"var(--mut)"}}>{r.spread_pct!=null?r.spread_pct.toFixed(0):"·"}</td>
                {engines.map(e => {
                  const v = r.engines && r.engines[e];
                  const dev = (v!=null && r.mean) ? (v - r.mean)/r.mean*100 : null;
                  const bg = devColor(dev);
                  return (
                    <td key={e} title={v!=null?`${e}: ${v.toFixed(1)} (${dev>=0?"+":""}${dev.toFixed(0)}% vs mean)`:`${e}: no value`}
                        className={bg ? "cell" : "cell na"}
                        style={{background: bg || "transparent", color: bg ? devInk(dev) : undefined}}>
                      {v==null ? "·" : showVal ? v.toFixed(0) : `${dev>=0?"+":""}${dev.toFixed(0)}`}
                    </td>);
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lgd" style={{marginTop:8}}>
        <span><i style={{background:devColor(-100),width:14,height:10}}/>100% or more below state mean</span>
        <span><i style={{background:devColor(-50),width:14,height:10}}/>50% below</span>
        <span><i style={{background:devColor(0),width:14,height:10,outline:"1px solid var(--line)"}}/>at mean</span>
        <span><i style={{background:devColor(50),width:14,height:10}}/>50% above</span>
        <span><i style={{background:devColor(100),width:14,height:10}}/>100% or more above</span>
      </div>
      <div className="note">
        Each cell is one engine's percent deviation from the cross-engine mean for
        <b> {fmtLabel(meta.metric_label)}</b> under <b>{meta.bucket}</b> at {meta.target_year}.
        States are sorted by coefficient of variation (widest engine disagreement at
        top). Click a state name to load it in the other tabs. Higher CV means the
        engines disagree more about that state's trajectory. Data: api/engine_divergence.json.
      </div>
    </div>
  );
}
