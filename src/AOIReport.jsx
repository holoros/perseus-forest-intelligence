// AOI summary + forward projection. Given an area of interest (uploaded polygon
// or an inspected point) it summarizes: size, encompassing EPA L3 ecoregion,
// FIA-derived forest attributes and landowner composition for plots inside the
// polygon (where available), and the ycx yield trajectory (untreated vs
// harvested) from yield_curves_by_l3.
import MiniChart from "./MiniChart.jsx";

const valAt = (curve, age) => { const h = (curve||[]).find(([a])=>a===age); return h?h[1]:null; };
const fmtArea = (m2) => {
  if(!m2) return null;
  const ac = m2 / 4046.8564224, ha = m2 / 1e4;
  return ac >= 1000 ? `${Math.round(ac).toLocaleString()} ac (${Math.round(ha).toLocaleString()} ha)`
                    : `${ac.toFixed(0)} ac (${ha.toFixed(0)} ha)`;
};
const OWN_COL = { "Private (Family/Corporate)":"#3fb68b", "State / Local":"#6baed6",
  "National Forest":"#8da0cb", "Other Federal":"#e6ab02" };

export default function AOIReport({ aoi, onClose }){
  if(!aoi) return null;
  const { name, l3code, l3name, l1, centroid, nVerts, curves, area_m2, state, plotStats } = aoi;
  const unt = (curves && curves.untreated) || [];
  const har = (curves && curves.harvested) || [];
  const agb50 = valAt(unt, 50), agb50h = valAt(har, 50);
  const series = [
    { label: "untreated", color: "#3fb68b", pts: unt.map(([a,v]) => [a, null, v, null]) },
    { label: "harvested", color: "#e6ab02", pts: har.map(([a,v]) => [a, null, v, null]) },
  ].filter(s => s.pts.length);
  const Row = ({k,v}) => <div className="aoi-row"><span className="aoi-k">{k}</span><span className="aoi-v">{v}</span></div>;

  return (
    <div className="aoi-report">
      <div className="aoi-head">
        <b>AOI summary{name ? ` · ${name}` : ""}</b>
        {onClose && <button className="aoi-x" onClick={onClose} title="close">×</button>}
      </div>

      <div className="aoi-grid">
        {area_m2 ? <Row k="Area" v={fmtArea(area_m2)}/> : null}
        {centroid ? <Row k="Centroid" v={`${centroid[1].toFixed(3)}°, ${centroid[0].toFixed(3)}°`}/> : null}
        <Row k="Ecoregion" v={l3code ? `${l3code} ${l3name||""}` : "—"}/>
        {l1 ? <Row k="Biome (L1)" v={l1}/> : null}
        {agb50 != null ? <Row k="AGB @50yr" v={`${agb50.toFixed(0)} ton/ac${agb50h!=null?` (${agb50h.toFixed(0)} harvested)`:""}`}/> : null}
      </div>

      {plotStats && plotStats.n > 0 && (<>
        <div className="aoi-sub">Forest attributes · {plotStats.n} FIA plots{plotStats.invYears?` (${plotStats.invYears[0]}–${plotStats.invYears[1]})`:""}</div>
        <div className="aoi-grid">
          {plotStats.meanAge != null && <Row k="Mean stand age" v={`${plotStats.meanAge.toFixed(0)} yr`}/>}
          {plotStats.meanBA != null && <Row k="Mean live BA" v={`${plotStats.meanBA.toFixed(0)} sq ft/ac`}/>}
        </div>
        {plotStats.ownership && plotStats.ownership.length > 0 && (<>
          <div className="aoi-sub">Landowner composition</div>
          <div className="aoi-bars">
            {plotStats.ownership.map(o => (
              <div key={o.label} className="aoi-bar-row" title={`${o.n} plots`}>
                <span className="aoi-bar-lab">{o.label}</span>
                <span className="aoi-bar-track"><span className="aoi-bar-fill"
                  style={{width:`${o.pct}%`, background: OWN_COL[o.label] || "#888"}}/></span>
                <span className="aoi-bar-pct">{o.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </>)}
      </>)}
      {plotStats && plotStats.n === 0 && (
        <div className="note" style={{margin:"2px 0 6px"}}>No FIA plots fall inside this AOI{state?` in ${state}`:""}.</div>
      )}
      {!plotStats && (
        <div className="note" style={{margin:"2px 0 6px"}}>Plot-level attributes available for ME, GA, IN, MN, OR, WA AOIs.</div>
      )}

      {series.length ? <>
        <div className="aoi-sub">Model projection · ycx by ecoregion</div>
        <div className="chartcard" style={{padding:"6px 8px"}}>
          <MiniChart series={series} unit="AGB (ton/ac)" height={200}/>
        </div>
        <div className="lgd" style={{marginTop:6}}>
          <span><i style={{background:"#3fb68b",width:14,height:3}}/>untreated</span>
          <span><i style={{background:"#e6ab02",width:14,height:3}}/>harvested</span>
        </div>
      </> : (
        <div className="note" style={{margin:"4px 0"}}>L3 {l3code} {l3name} has no fitted ycx yield curve yet.</div>
      )}
      <div className="note" style={{marginTop:6}}>
        Sources: FIA plots (attributes, ownership), yield_curves_by_l3 (projection),
        us_eco_l3_features (ecoregion). Area is geodesic (Albers equal-area).
      </div>
    </div>
  );
}
