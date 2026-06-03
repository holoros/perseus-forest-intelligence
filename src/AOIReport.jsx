// AOI summary + forward projection. Given an area of interest (uploaded polygon
// or an inspected point) it summarizes: size, encompassing EPA L3 ecoregion,
// FIA-derived forest attributes and landowner composition for plots inside the
// polygon (where available), and the ycx yield trajectory (untreated vs
// harvested) from yield_curves_by_l3.
import MiniChart from "./MiniChart.jsx";
import StandOutlook from "./StandOutlook.jsx";
import { openReport } from "./report.js";
import { conv, fmtArea as fmtAreaU } from "./units.js";

const valAt = (curve, age) => { const h = (curve||[]).find(([a])=>a===age); return h?h[1]:null; };
const fmtArea = (m2) => {
  if(!m2) return null;
  const ac = m2 / 4046.8564224, ha = m2 / 1e4;
  return ac >= 1000 ? `${Math.round(ac).toLocaleString()} ac (${Math.round(ha).toLocaleString()} ha)`
                    : `${ac.toFixed(0)} ac (${ha.toFixed(0)} ha)`;
};
const OWN_COL = { "Private (Family/Corporate)":"#3fb68b", "State / Local":"#6baed6",
  "National Forest":"#8da0cb", "Other Federal":"#3C5488", "Tribal":"#8c510a" };
const FT_PALETTE = ["#3fb68b","#6baed6","#e6ab02","#d95f02","#8da0cb","#a6761d"];
// Band coloring. Risk: low=good(green). Habitat/biodiversity: high=good(green).
const BAND_GOOD_HIGH = { "High":"#3fb68b", "Moderate":"#e6ab02", "Low":"#d9734f" };
const BAND_GOOD_LOW  = { "Low":"#3fb68b", "Moderate":"#e6ab02", "High":"#d9534f" };

// One- or two-sentence plain-language read of the condition index.
const IDX_NAMES = { structure:"forest structure", economic:"economic value",
  ecosystem:"ecosystem value", risk:"disturbance risk" };
function radarNarrative(index){
  if(!index) return null;
  const lvl = v => v<0.34?"low":v<0.67?"moderate":"high";
  const good = Object.entries(index).filter(([k,v])=>k!=="risk" && v!=null).sort((a,b)=>b[1]-a[1]);
  if(good.length < 2) return null;
  const hi = good[0], lo = good[good.length-1];
  const risk = index.risk!=null ? ` Disturbance risk is ${lvl(index.risk)}.` : "";
  return `This area is strongest on ${IDX_NAMES[hi[0]]} (${lvl(hi[1])}) and weakest on ${IDX_NAMES[lo[0]]} (${lvl(lo[1])}).${risk}`;
}

// Condition-index radar: 4 axes (structure, economic value, ecosystem value,
// risk vulnerability), each 0..1. Outer = higher magnitude of that dimension.
function ConditionRadar({ index }){
  if(!index) return null;
  const AX = [
    ["structure","Forest\nstructure"], ["economic","Economic\nvalue"],
    ["ecosystem","Ecosystem\nvalue"], ["risk","Risk\nvuln."],
  ];
  const C = 96, R = 62;                      // center, max radius
  const ang = i => (-90 + i*90) * Math.PI/180;
  const pt = (i, r) => [C + r*Math.cos(ang(i)), C + r*Math.sin(ang(i))];
  const rings = [0.25,0.5,0.75,1].map((f,k) =>
    <circle key={k} cx={C} cy={C} r={R*f} fill="none" stroke="var(--line)" strokeWidth="0.75"/>);
  const spokes = AX.map((_,i) => { const [x,y]=pt(i,R);
    return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--line)" strokeWidth="0.75"/>; });
  const vals = AX.map(([k]) => index[k]==null ? 0 : Math.max(0,Math.min(1,index[k])));
  const poly = AX.map((_,i) => pt(i, R*vals[i]).map(n=>n.toFixed(1)).join(",")).join(" ");
  const labels = AX.map(([k,lab],i) => {
    const [x,y]=pt(i, R+16); const lines=lab.split("\n");
    const has = index[k]!=null;
    return <text key={k} x={x} y={y - (lines.length-1)*5} textAnchor="middle"
      fontSize="9" fill={has?"var(--ink)":"#5e7180"}>
      {lines.map((ln,j)=><tspan key={j} x={x} dy={j?10:0}>{ln}</tspan>)}</text>;
  });
  const dots = AX.map((_,i) => { const [x,y]=pt(i, R*vals[i]);
    return <circle key={i} cx={x} cy={y} r="2.4" fill="#3fb68b"/>; });
  return (
    <svg viewBox="0 0 192 200" style={{width:"100%",maxWidth:230,display:"block",margin:"2px auto 0"}}>
      {rings}{spokes}
      <polygon points={poly} fill="#3fb68b" fillOpacity="0.22" stroke="#3fb68b" strokeWidth="1.6"/>
      {dots}{labels}
    </svg>
  );
}

function downloadCsv(aoi){
  const rows = [["field","value"]];
  rows.push(["name", aoi.name||""]);
  if(aoi.area_m2) rows.push(["area_ac",(aoi.area_m2/4046.8564224).toFixed(0)],["area_ha",(aoi.area_m2/1e4).toFixed(0)]);
  if(aoi.centroid) rows.push(["centroid_lat",aoi.centroid[1].toFixed(4)],["centroid_lon",aoi.centroid[0].toFixed(4)]);
  rows.push(["ecoregion_l3",`${aoi.l3code||""} ${aoi.l3name||""}`.trim()],["biome_l1",aoi.l1||""]);
  const ps = aoi.plotStats;
  if(ps && ps.n>0){
    rows.push(["fia_plots",ps.n]);
    if(ps.meanAge!=null) rows.push(["mean_stand_age_yr",ps.meanAge.toFixed(0)]);
    if(ps.meanBA!=null) rows.push(["mean_live_ba_sqft_ac",ps.meanBA.toFixed(0)]);
    (ps.ownership||[]).forEach(o=>rows.push([`owner_${o.label}`,`${o.pct.toFixed(0)}%`]));
    (ps.forestTypes||[]).forEach(f=>rows.push([`fortype_${f.label}`,`${f.pct.toFixed(0)}%`]));
  }
  const c = aoi.curves && aoi.curves.untreated;
  if(c) c.forEach(([age,v])=>rows.push([`agb_tonac_age${age}_untreated`, v]));
  const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aoi_summary_${(aoi.l3code||"aoi").replace(/\./g,"_")}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

export default function AOIReport({ aoi, stumpage, onClose, units = "imperial" }){
  if(!aoi) return null;
  const cv = (v, u, d=0) => { const c = conv(v, u, units); return `${c.value.toFixed(d)} ${c.unit}`; };
  const price = (v, u) => { const c = conv(v, u, units); return `$${Math.round(c.value)}/${c.unit.replace("$/","")}`; };
  const { name, l3code, l3name, l1, centroid, nVerts, curves, area_m2, state, plotStats, landscape } = aoi;
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
        <span>
          <button className="mini-btn" style={{marginTop:0,marginRight:6,borderStyle:"solid",fontWeight:600}}
            onClick={()=>openReport(aoi, stumpage, units)} title="open a full printable area report (save or print to PDF)">Report ↗</button>
          <button className="mini-btn" style={{marginTop:0,marginRight:6}}
            onClick={()=>downloadCsv(aoi)} title="download this summary as CSV">CSV ↓</button>
          {onClose && <button className="aoi-x" onClick={onClose} title="close">×</button>}
        </span>
      </div>

      <div className="aoi-grid">
        {area_m2 ? <Row k="Area" v={fmtAreaU(area_m2, units)}/> : null}
        {centroid ? <Row k="Centroid" v={`${centroid[1].toFixed(3)}°, ${centroid[0].toFixed(3)}°`}/> : null}
        <Row k="Ecoregion" v={l3code ? `${l3code} ${l3name||""}` : "—"}/>
        {l1 ? <Row k="Biome (L1)" v={l1}/> : null}
        {agb50 != null ? <Row k="AGB @50yr" v={`${cv(agb50,"ton/ac")}${agb50h!=null?` (${conv(agb50h,"ton/ac",units).value.toFixed(0)} harvested)`:""}`}/> : null}
      </div>

      {plotStats && plotStats.n > 0 && (<>
        <div className="aoi-sub">Forest attributes · {plotStats.n} FIA plots{plotStats.invYears?` (${plotStats.invYears[0]}–${plotStats.invYears[1]})`:""}</div>
        <div className="aoi-grid">
          {plotStats.meanAge != null && <Row k="Mean stand age" v={`${plotStats.meanAge.toFixed(0)} yr`}/>}
          {plotStats.meanBA != null && <Row k="Mean live BA" v={cv(plotStats.meanBA,"sq ft/ac")}/>}
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
        {plotStats.forestTypes && plotStats.forestTypes.length > 0 && (<>
          <div className="aoi-sub">Forest-type composition</div>
          <div className="aoi-bars">
            {plotStats.forestTypes.map((f,i) => (
              <div key={f.label} className="aoi-bar-row" title={`${f.n} plots`}>
                <span className="aoi-bar-lab">{f.label}</span>
                <span className="aoi-bar-track"><span className="aoi-bar-fill"
                  style={{width:`${f.pct}%`, background: FT_PALETTE[i % FT_PALETTE.length]}}/></span>
                <span className="aoi-bar-pct">{f.pct.toFixed(0)}%</span>
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

      {landscape && (landscape.ownership || landscape.risk || landscape.habitat || landscape.biodiversity || landscape.siteProductivity || landscape.speciesValue || landscape.stumpage || landscape.index) && (<>
        <div className="aoi-sub">Condition index · quick look</div>
        {landscape.index && (
          <div>
            <ConditionRadar index={landscape.index}/>
            {radarNarrative(landscape.index) && (
              <div style={{margin:"2px 6px 4px",fontSize:12.5,color:"var(--ink)"}}>{radarNarrative(landscape.index)}</div>
            )}
            <div className="note" style={{margin:"0 0 4px",textAlign:"center"}}>
              Integrated condition across four dimensions (0–1). Outer = higher; for Risk, outer = more vulnerable.
            </div>
          </div>
        )}
        <div className="aoi-sub">Surrounding landscape · sampled from CONUS layers</div>
        {landscape.forestFrac != null && (
          <div className="aoi-grid">
            <Row k="Forest cover (area)" v={`${Math.round(landscape.forestFrac*100)}%`}/>
          </div>
        )}
        {landscape.ownership && landscape.ownership.length > 0 && (<>
          <div className="aoi-sub" style={{borderTop:"none",marginTop:4}}>Landowner composition (forest ownership)</div>
          <div className="aoi-bars">
            {landscape.ownership.map(o => (
              <div key={o.label} className="aoi-bar-row" title={`${o.n} sampled cells`}>
                <span className="aoi-bar-lab">{o.label}</span>
                <span className="aoi-bar-track"><span className="aoi-bar-fill"
                  style={{width:`${o.pct}%`, background: OWN_COL[o.label] || "#888"}}/></span>
                <span className="aoi-bar-pct">{o.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </>)}
        <div className="aoi-bars" style={{marginTop:6}}>
          {landscape.risk && (
            <div className="aoi-bar-row" title={`mean P(disturbance) ${landscape.risk.mean.toFixed(2)}; ${landscape.risk.hi.toFixed(0)}% of area high-risk`}>
              <span className="aoi-bar-lab">Disturbance risk (2022)</span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${Math.min(100, landscape.risk.mean/0.72*100)}%`,
                        background: BAND_GOOD_LOW[landscape.risk.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_LOW[landscape.risk.band]}}>{landscape.risk.band}</span>
            </div>
          )}
          {landscape.habitat && (
            <div className="aoi-bar-row" title="Indicative composite of forest continuity, structural maturity, and disturbance">
              <span className="aoi-bar-lab">Habitat quality <i style={{opacity:.6,fontStyle:"normal"}}>~</i></span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.habitat.score*100}%`,
                        background: BAND_GOOD_HIGH[landscape.habitat.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.habitat.band]}}>{landscape.habitat.band}</span>
            </div>
          )}
          {landscape.biodiversity && (
            <div className="aoi-bar-row" title={`Forest-type evenness ${(landscape.diversity?landscape.diversity.evenness:0).toFixed(2)}; richness ${landscape.diversity?landscape.diversity.richness:0}`}>
              <span className="aoi-bar-lab">Biodiversity <i style={{opacity:.6,fontStyle:"normal"}}>~</i></span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.biodiversity.score*100}%`,
                        background: BAND_GOOD_HIGH[landscape.biodiversity.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.biodiversity.band]}}>{landscape.biodiversity.band}</span>
            </div>
          )}
          {landscape.siteProductivity && (
            <div className="aoi-bar-row" title="Relative position on the Climate Site Productivity Index (CSPI) within this area">
              <span className="aoi-bar-lab">Site productivity (CSPI)</span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.siteProductivity.rel*100}%`,
                        background: BAND_GOOD_HIGH[landscape.siteProductivity.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.siteProductivity.band]}}>{landscape.siteProductivity.band}</span>
            </div>
          )}
          {landscape.speciesValue && (
            <div className="aoi-bar-row" title="Relative commercial species value (SVI, regional mean = 1) within this area">
              <span className="aoi-bar-lab">Species value (SVI)</span>
              <span className="aoi-bar-track"><span className="aoi-bar-fill"
                style={{width:`${landscape.speciesValue.rel*100}%`,
                        background: BAND_GOOD_HIGH[landscape.speciesValue.band] || "#888"}}/></span>
              <span className="aoi-bar-pct" style={{color:BAND_GOOD_HIGH[landscape.speciesValue.band]}}>{landscape.speciesValue.band}</span>
            </div>
          )}
        </div>
        {landscape.stumpage && (<>
          <div className="aoi-sub" style={{borderTop:"none",marginTop:6}}>Stumpage prices{state?` · ${state}`:""}</div>
          <div className="aoi-grid">
            {landscape.stumpage.sawSW!=null && <Row k="Sawlog · softwood" v={price(landscape.stumpage.sawSW,"$/MBF")}/>}
            {landscape.stumpage.sawHW!=null && <Row k="Sawlog · hardwood" v={price(landscape.stumpage.sawHW,"$/MBF")}/>}
            {landscape.stumpage.pulpSW!=null && <Row k="Pulpwood · softwood" v={price(landscape.stumpage.pulpSW,"$/cord")}/>}
            {landscape.stumpage.pulpHW!=null && <Row k="Pulpwood · hardwood" v={price(landscape.stumpage.pulpHW,"$/cord")}/>}
          </div>
        </>)}
        <div className="note" style={{margin:"4px 0 2px"}}>
          Landowner, forest cover, and disturbance risk are sampled from the CONUS rasters inside this area.
          Habitat and biodiversity (<i>~</i>) are indicative composites of forest continuity, structural maturity,
          and forest-type diversity — refine with field inventory.
        </div>
      </>)}

      <StandOutlook aoi={aoi} stumpage={stumpage} units={units}/>
      <div className="note" style={{marginTop:6}}>
        Sources: FIA plots (attributes, ownership), yield_curves_by_l3 (projection),
        us_eco_l3_features (ecoregion). Area is geodesic (Albers equal-area).
      </div>
    </div>
  );
}
