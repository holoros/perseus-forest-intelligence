import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import GrowthChart from "./GrowthChart.jsx";

const BASE = import.meta.env.BASE_URL; // "./" -> resolves relative to the page
const FOCAL = ["ME","IN","GA"];        // PERSEUS focal states
const CARBON = ["agc_live_total","live_c_total","tree_c_total","agb_dry","total_ecosystem_c"];
// Tier B layer A: LANDIS total live biomass + species mosaics for Maine (30 m,
// derived from cbm_maine LANDIS-II runs). Three timesteps (base / +5 / +10).
const LANDIS_STATES = ["ME"];
const LANDIS_BOUNDS = [[-71.8317,47.7314],[-66.0072,47.7314],[-66.0072,42.4894],[-71.8317,42.4894]];
const LANDIS_STEPS = [0,5,10];
const LANDIS_LAYERS = [
  { file:"me_total_biomass", label:"Total live biomass", abs:true },
  { file:"me_BF",   label:"Balsam fir",  abs:false },
  { file:"me_RS",   label:"Red spruce",  abs:false },
  { file:"me_RM",   label:"Red maple",   abs:false },
  { file:"me_PINE", label:"Pine",        abs:false },
];
// Tier B layer B: gcbm_rasters_2022 stack (per-state, 30 m) for all 6 non-ME
// trajectory states (MN GA IN WA OR ID). Single 2022 snapshot, 3 layer types.
const GCBM_LAYERS = [
  { key:"carbon_l_2022", label:"Live tree carbon (Mg C/ha)",
    ramp:["#f7fcf5","#c7e9c0","#74c476","#238b45","#00441b"], lo:"0", hi:"200+" },
  { key:"balive_2022",   label:"Basal area live (sq ft/ac)",
    ramp:["#f7fbff","#c6dbef","#6baed6","#2171b5","#08306b"], lo:"0", hi:"200+" },
  { key:"lcms_2022",     label:"LCMS disturbance cause (2022)",
    ramp:["#fdae61","#d73027","#fc8d59","#fee08b","#762a83"], lo:"natural", hi:"anthrop." },
];
const CLASS_COL = { CBM:"#66c2a5", FVS:"#fc8d62", LANDIS:"#8da0cb", OSM:"#e78ac3",
  HCM:"#a6d854", YC:"#ffd92f", CEM:"#e5c494", FIA:"#b3b3b3", VCC:"#7570b3", "?":"#cccccc" };
const METRIC_ORDER = ["agc_live_total","live_c_total","tree_c_total","agb_dry","vol_stem",
  "total_ecosystem_c","mean_stand_age","old_forest_share_120"];

async function j(path){ const r = await fetch(BASE + path); if(!r.ok) throw new Error(path); return r.json(); }
function parseHash(){ const p = new URLSearchParams(window.location.hash.replace(/^#/,""));
  return { state:p.get("state"), metric:p.get("metric"), mgmt:p.get("mgmt") }; }

export default function App(){
  const mapEl = useRef(null), map = useRef(null);
  const initRef = useRef(parseHash());      // one-shot URL deep-link restore
  const [meta,setMeta] = useState(null);
  const [states,setStates] = useState(null);
  const [sel,setSel] = useState(initRef.current.state || "ME");
  const [series,setSeries] = useState(null);
  const [fia,setFia] = useState({});
  const [metric,setMetric] = useState("agc_live_total");
  const [bucket,setBucket] = useState("managed (harvest)");
  const [showBands,setShowBands] = useState(false);
  const [mapReady,setMapReady] = useState(false);
  const [rasterOn,setRasterOn] = useState(false);
  const [rasterT,setRasterT] = useState(0);
  const [rasterLayer,setRasterLayer] = useState("me_total_biomass");
  const [rasterOpacity,setRasterOpacity] = useState(0.85);
  // Tier B layer B: gcbm overlays + per-state bounds cache
  const [gcbmOn,setGcbmOn] = useState(false);
  const [gcbmLayer,setGcbmLayer] = useState("carbon_l_2022");
  const [gcbmOpacity,setGcbmOpacity] = useState(0.85);
  const [gcbmBounds,setGcbmBounds] = useState({}); // st -> coords[4]

  // ---- initial data + map ----
  useEffect(()=>{ (async()=>{
    const [m,s,geo,f] = await Promise.all([
      j("api/meta.json"), j("api/states.json"), j("geo/us-states.geojson"), j("api/fia.json")]);
    setMeta(m); setStates(s); setFia(f);
    geo.features.forEach(ft=>{ const st=ft.properties.state; const c=s[st];
      ft.properties.engines = c ? c.engines : 0;
      ft.properties.hasSeries = (c && c.has_series) ? 1 : 0;
      ft.properties.focal = FOCAL.includes(st) ? 1 : 0; });
    const mp = new maplibregl.Map({ container: mapEl.current,
      style:{ version:8, sources:{}, glyphs:undefined,
        layers:[{id:"bg",type:"background",paint:{"background-color":"#0b1015"}}] },
      center:[-96,38], zoom:3, attributionControl:false });
    map.current = mp;
    mp.on("load",()=>{
      mp.addSource("states",{ type:"geojson", data:geo, promoteId:"state" });
      mp.addLayer({ id:"fill", type:"fill", source:"states", paint:{
        "fill-color":["case",["==",["get","engines"],0],"#1a2530",
          ["step",["get","engines"],"#9ad9b8",4,"#54b88a",6,"#2f9e6a",20,"#1b7a4d"]],
        "fill-opacity":["case",["==",["get","focal"],1],0.95,
          ["case",["==",["get","hasSeries"],1],0.5,0.32]] }});
      mp.addLayer({ id:"line", type:"line", source:"states",
        paint:{"line-color":"#0b1015","line-width":0.6} });
      mp.addLayer({ id:"focalline", type:"line", source:"states",
        filter:["==",["get","focal"],1],
        paint:{"line-color":"#f4c430","line-width":1.8} });
      mp.addLayer({ id:"sel", type:"line", source:"states",
        filter:["==",["get","state"],sel],
        paint:{"line-color":"#ffffff","line-width":2.4} });
      mp.fitBounds([[-125,24],[-66,50]],{padding:24,duration:0});
      const pop = new maplibregl.Popup({closeButton:false,closeOnClick:false});
      mp.on("mousemove","fill",(e)=>{ const p=e.features[0].properties;
        mp.getCanvas().style.cursor = p.hasSeries? "pointer":"";
        pop.setLngLat(e.lngLat).setHTML(
          `<b>${p.state}</b> · ${p.engines||0} engines${p.hasSeries?"":" · no model data"}`).addTo(mp); });
      mp.on("mouseleave","fill",()=>{ pop.remove(); mp.getCanvas().style.cursor=""; });
      mp.on("click","fill",(e)=>{ const p=e.features[0].properties;
        if(p.hasSeries) setSel(p.state); });
      setMapReady(true);
    });
  })().catch(console.error); return ()=> map.current && map.current.remove(); },[]);

  // ---- selected-state outline ----
  useEffect(()=>{ const mp=map.current; if(mp && mp.getLayer && mp.getLayer("sel"))
    mp.setFilter("sel",["==",["get","state"],sel]); },[sel]);

  // ---- Tier B layer A: LANDIS biomass image source (Maine only) ----
  useEffect(()=>{ const mp=map.current; if(!mp || !mapReady) return;
    const show = rasterOn && LANDIS_STATES.includes(sel);
    const url = `${BASE}raster/${rasterLayer}_t${rasterT}.png`;
    if(show){
      if(!mp.getSource("mebio")){
        mp.addSource("mebio",{type:"image",url,coordinates:LANDIS_BOUNDS});
        mp.addLayer({id:"mebio",type:"raster",source:"mebio",paint:{"raster-opacity":rasterOpacity}},"focalline");
      } else { mp.getSource("mebio").updateImage({url,coordinates:LANDIS_BOUNDS}); }
      if(mp.getLayer("mebio")) mp.setPaintProperty("mebio","raster-opacity",rasterOpacity);
    } else {
      if(mp.getLayer("mebio")) mp.removeLayer("mebio");
      if(mp.getSource("mebio")) mp.removeSource("mebio");
    }
  },[mapReady,rasterOn,rasterT,rasterLayer,sel,rasterOpacity]);

  // ---- Tier B layer B: gcbm raster overlays (per-state, 2022 snapshot) ----
  // Lazy-load per-state bounds.json; turn bounds into a coordinates polygon.
  useEffect(()=>{ if(!gcbmOn) return;
    const stLow = sel.toLowerCase();
    if(gcbmBounds[stLow]) return;
    j(`raster/${stLow}_bounds.json`).then(b=>{
      const coords = [[b.ul[0],b.ul[1]],[b.ur[0],b.ur[1]],[b.lr[0],b.lr[1]],[b.ll[0],b.ll[1]]];
      setGcbmBounds(prev=>({...prev,[stLow]:coords}));
    }).catch(()=>{});
  },[gcbmOn,sel,gcbmBounds]);
  useEffect(()=>{ const mp=map.current; if(!mp || !mapReady) return;
    const stLow = sel.toLowerCase();
    const eligible = states && states[sel] && states[sel].has_tier_b && !LANDIS_STATES.includes(sel);
    const coords = gcbmBounds[stLow];
    const show = gcbmOn && eligible && !!coords;
    const url = `${BASE}raster/${stLow}_${gcbmLayer}.png`;
    if(show){
      if(!mp.getSource("stgcbm")){
        mp.addSource("stgcbm",{type:"image",url,coordinates:coords});
        mp.addLayer({id:"stgcbm",type:"raster",source:"stgcbm",paint:{"raster-opacity":gcbmOpacity}},"focalline");
      } else { mp.getSource("stgcbm").updateImage({url,coordinates:coords}); }
      if(mp.getLayer("stgcbm")) mp.setPaintProperty("stgcbm","raster-opacity",gcbmOpacity);
    } else {
      if(mp.getLayer("stgcbm")) mp.removeLayer("stgcbm");
      if(mp.getSource("stgcbm")) mp.removeSource("stgcbm");
    }
  },[mapReady,gcbmOn,sel,gcbmLayer,gcbmOpacity,gcbmBounds,states]);

  // ---- load series for selected state ----
  useEffect(()=>{ if(!states || !states[sel] || !states[sel].has_series){ setSeries(null); return; }
    j(`api/series/${sel}.json`).then(d=>{
      setSeries(d);
      const avail = Object.keys(d);
      const want = initRef.current.metric;
      const m = (want && avail.includes(want)) ? want : (METRIC_ORDER.find(x=>avail.includes(x)) || avail[0]);
      initRef.current.metric = null;
      setMetric(m);
    }).catch(console.error);
  },[sel,states]);

  // ---- keep metric/bucket valid (honor a deep-linked bucket once) ----
  useEffect(()=>{ if(!series || !series[metric]) return;
    const bks = Object.keys(series[metric]);
    const wantB = initRef.current.mgmt;
    if(wantB && bks.includes(wantB)){ initRef.current.mgmt = null; if(wantB!==bucket) setBucket(wantB); return; }
    if(!bks.includes(bucket)) setBucket(bks[0]);
  },[series,metric]);

  // ---- write deep-link to the URL hash ----
  useEffect(()=>{ if(sel && metric && bucket){
    const p = new URLSearchParams({state:sel, metric, mgmt:bucket});
    window.history.replaceState(null, "", `#${p.toString()}`);
  }},[sel,metric,bucket]);

  const cov = states && states[sel];
  const node = series && series[metric] && series[metric][bucket];
  const metricsAvail = series ? Object.keys(series).sort(
    (a,b)=> (METRIC_ORDER.indexOf(a)+1||99) - (METRIC_ORDER.indexOf(b)+1||99)) : [];
  const hasCarbon = metricsAvail.some(m=>CARBON.includes(m));
  const bucketsAvail = series && series[metric] ? Object.keys(series[metric]) : [];
  const hasBands = !!(node && node.some(s=> s.pts.some(p=> p.length>=4)));
  const fiaRef = (metric==="agc_live_total" && fia[sel]) ? fia[sel].tg_agc : null;
  const mlabel = (mc)=> (meta && meta.metrics[mc]) ? meta.metrics[mc].label : mc;

  return (
    <div className="app">
      <header className="top">
        <h1>PERSEUS Forest Intelligence <span className="pill">Tier A</span></h1>
        <span className="sub">Focal states: <b style={{color:"#f4c430"}}>ME · IN · GA</b> · click a state for multi-model growth curves</span>
        <span className="stat">{meta && `${meta.stats.states} states · ${meta.stats.engines} engines · ${meta.stats.metrics} metrics · ${Number(meta.stats.rows).toLocaleString()} rows`}</span>
      </header>
      <div className="main">
        <div className="mapwrap">
          <div className="maptitle">Coverage — engines per state</div>
          <div id="map" ref={mapEl}></div>
          <div className="legend">
            <div style={{marginBottom:3}}><i style={{background:"transparent",border:"2px solid #f4c430"}}></i>PERSEUS focal (ME · IN · GA)</div>
            <div><i style={{background:"#1b7a4d"}}></i>20+ &nbsp;<i style={{background:"#2f9e6a"}}></i>6–19 &nbsp;<i style={{background:"#54b88a"}}></i>4–5 &nbsp;<i style={{background:"#9ad9b8"}}></i>1–3</div>
            <div><i style={{background:"#1a2530"}}></i>no model data yet</div>
          </div>
          {rasterOn && LANDIS_STATES.includes(sel) && (() => {
            const cl = LANDIS_LAYERS.find(l=>l.file===rasterLayer) || LANDIS_LAYERS[0];
            return (
            <div className="legend" style={{left:"auto",right:12}}>
              <div style={{marginBottom:4}}>LANDIS {cl.label.toLowerCase()} ({rasterT===0?"base year":`+${rasterT} yr`})</div>
              <div style={{height:10,width:150,borderRadius:2,
                background:"linear-gradient(90deg,#f7fcf5,#c7e9c0,#74c476,#238b45,#00441b)"}}></div>
              <div style={{display:"flex",justifyContent:"space-between",width:150}}>
                {cl.abs ? <><span>1000</span><span>g/m²</span><span>19000</span></>
                        : <><span>low</span><span>g/m² (relative)</span><span>high</span></>}</div>
            </div>);})()}
          {gcbmOn && states && states[sel] && states[sel].has_tier_b && !LANDIS_STATES.includes(sel) && (() => {
            const gl = GCBM_LAYERS.find(l=>l.key===gcbmLayer) || GCBM_LAYERS[0];
            return (
            <div className="legend" style={{left:"auto",right:12}}>
              <div style={{marginBottom:4}}>{gl.label} · {sel} (FIA 2022, gcbm rasters)</div>
              <div style={{height:10,width:150,borderRadius:2,
                background:`linear-gradient(90deg,${gl.ramp.join(",")})`}}></div>
              <div style={{display:"flex",justifyContent:"space-between",width:150}}>
                <span>{gl.lo}</span><span></span><span>{gl.hi}</span>
              </div>
            </div>);})()}
        </div>
        <div className="detail">
          <h2>Detail — growth curves</h2>
          <div className="who">{cov ? <><b>{cov.name}</b> <span style={{color:"var(--mut)"}}>· {cov.engines} engines · {cov.metrics} metrics · {cov.rows.toLocaleString()} rows</span></> : sel}</div>
          {LANDIS_STATES.includes(sel) && (
            <div className="controls" style={{margin:"0 4px 8px"}}>
              <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--mut)"}}>
                <input type="checkbox" checked={rasterOn} onChange={e=>setRasterOn(e.target.checked)}/> spatial layer: LANDIS biomass (30 m)
              </label>
              {rasterOn && <select value={rasterLayer} onChange={e=>setRasterLayer(e.target.value)}>
                {LANDIS_LAYERS.map(l=> <option key={l.file} value={l.file}>{l.label}</option>)}
              </select>}
              {rasterOn && <select value={rasterT} onChange={e=>setRasterT(+e.target.value)}
                  title="LANDIS years from the run base (≈ current FIA inventory)">
                {LANDIS_STEPS.map(t=> <option key={t} value={t}>{t===0?"base year":`+${t} yr`}</option>)}
              </select>}
              {rasterOn && <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"var(--mut)"}}>
                opacity <input type="range" min="0.2" max="1" step="0.05" value={rasterOpacity}
                  onChange={e=>setRasterOpacity(+e.target.value)} style={{verticalAlign:"middle"}}/>
              </label>}
            </div>)}
          {states && states[sel] && states[sel].has_tier_b && !LANDIS_STATES.includes(sel) && (
            <div className="controls" style={{margin:"0 4px 8px"}}>
              <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--mut)"}}>
                <input type="checkbox" checked={gcbmOn} onChange={e=>setGcbmOn(e.target.checked)}/> spatial layer: FIA-derived rasters (30 m, 2022)
              </label>
              {gcbmOn && <select value={gcbmLayer} onChange={e=>setGcbmLayer(e.target.value)}>
                {GCBM_LAYERS.map(l=> <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>}
              {gcbmOn && <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"var(--mut)"}}>
                opacity <input type="range" min="0.2" max="1" step="0.05" value={gcbmOpacity}
                  onChange={e=>setGcbmOpacity(+e.target.value)} style={{verticalAlign:"middle"}}/>
              </label>}
            </div>)}
          {!series && <div className="empty">No multi-year model series for this state yet. {FOCAL.includes(sel) ? "Model projections for this focal state are pending ingest." : "Pick a focal state — ME · IN · GA."}</div>}
          {series && !hasCarbon && <div className="note" style={{color:"#f4c430"}}>Model carbon projections pending for {cov && cov.name} — showing FIA-observed metrics below. (libcbm cross-state covers ME &amp; GA; IN projections not yet ingested.)</div>}
          {series && (<>
            <div className="controls">
              <select value={metric} onChange={e=>setMetric(e.target.value)}>
                {metricsAvail.map(mc=> <option key={mc} value={mc}>{mlabel(mc)}</option>)}
              </select>
              <select value={bucket} onChange={e=>setBucket(e.target.value)}>
                {bucketsAvail.map(b=> <option key={b} value={b}>{b}</option>)}
              </select>
              {hasBands && <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--mut)"}}>
                <input type="checkbox" checked={showBands} onChange={e=>setShowBands(e.target.checked)}/> uncertainty
              </label>}
            </div>
            <div className="chartcard">
              <GrowthChart node={node} fiaRef={fiaRef} fiaYear={fia[sel] && fia[sel].year}
                unit={meta && meta.metrics[metric] && meta.metrics[metric].unit} classCol={CLASS_COL}
                showBands={showBands && hasBands}/>
            </div>
            <div className="lgd">
              {node && [...new Set(node.map(s=>s.cls))].map(c=>
                <span key={c}><i style={{background:CLASS_COL[c]||"#bbb"}}></i>{c} ({node.filter(s=>s.cls===c).length})</span>)}
              {fiaRef && <span><i style={{background:"#9fb3c0"}}></i>FIA observed</span>}
            </div>
            <div className="note">
              Each line is one engine's median trajectory for <b>{mlabel(metric)}</b> under <b>{bucket}</b>
              {node && ` (${node.length} engine${node.length===1?"":"s"})`}. Data: perseus_db v0.52 (pool-harmonized).
              Maine carries the full multi-model stack; cross-state engines (libcbm) populate GA/MN/OR/WA.
              {" "}Management buckets collapse each engine's scenarios by harvest rule, so within-engine scenario spread is folded in. Hover a line for the engine.
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
