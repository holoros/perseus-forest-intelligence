// AOI forward-projection report. Reconstructed (v1.3 parity). Given an
// area of interest resolved to an EPA L3 ecoregion, shows the ycx yield
// trajectory (untreated vs harvested) from yield_curves_by_l3 with a narrative
// led by projected biomass at age 50. Used both for uploaded AOIs and for the
// click inspector's "project this point" action.
import MiniChart from "./MiniChart.jsx";

const valAt = (curve, age) => { const h = (curve||[]).find(([a])=>a===age); return h?h[1]:null; };

export default function AOIReport({ aoi, onClose }){
  if(!aoi) return null;
  const { name, l3code, l3name, l1, centroid, nVerts, curves } = aoi;
  const unt = (curves && curves.untreated) || [];
  const har = (curves && curves.harvested) || [];
  const agb50 = valAt(unt, 50), agb50h = valAt(har, 50);
  const series = [
    { label: "untreated", color: "#3fb68b", pts: unt.map(([a,v]) => [a, null, v, null]) },
    { label: "harvested", color: "#e6ab02", pts: har.map(([a,v]) => [a, null, v, null]) },
  ].filter(s => s.pts.length);

  return (
    <div className="aoi-report">
      <div className="aoi-head">
        <b>AOI projection{name ? ` · ${name}` : ""}</b>
        {onClose && <button className="aoi-x" onClick={onClose} title="close">×</button>}
      </div>
      {!curves
        ? <div className="note" style={{margin:"6px 0"}}>
            This AOI falls in L3 <b>{l3code} {l3name}</b>, which has no fitted ycx
            yield curve yet. Centroid {centroid && `${centroid[1].toFixed(3)}, ${centroid[0].toFixed(3)}`}.
          </div>
        : <>
          <div className="note" style={{margin:"4px 0 8px"}}>
            Centroid {centroid && `${centroid[1].toFixed(3)}°, ${centroid[0].toFixed(3)}°`}
            {nVerts ? ` · ${nVerts} vertices` : ""} · EPA L3 <b>{l3code} {l3name}</b>
            {l1 ? ` · ${l1}` : ""}.
            {agb50 != null && <> Projected above-ground biomass at 50 yr is
              <b> {agb50.toFixed(0)} ton/ac</b> untreated{agb50h != null && <>, {agb50h.toFixed(0)} ton/ac under the harvested regime</>}.</>}
          </div>
          <div className="chartcard" style={{padding:"6px 8px"}}>
            <MiniChart series={series} unit="AGB (ton/ac)"/>
          </div>
          <div className="lgd" style={{marginTop:8}}>
            <span><i style={{background:"#3fb68b",width:14,height:3}}/>untreated</span>
            <span><i style={{background:"#e6ab02",width:14,height:3}}/>harvested</span>
          </div>
          <div className="note">
            Yield trajectory for the encompassing L3 ecoregion (ycx Chapman-Richards
            fits), ages {unt.map(p=>p[0]).join(", ")}. Data: api/yield_curves_by_l3.json.
          </div>
        </>}
    </div>
  );
}
