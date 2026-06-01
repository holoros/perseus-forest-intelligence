import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import GrowthChart from "./GrowthChart.jsx";
import SVGMap from "./SVGMap.jsx";
import DivergenceHeatmap from "./DivergenceHeatmap.jsx";
import StumpagePanel from "./StumpagePanel.jsx";
import LandisStratified from "./LandisStratified.jsx";
import LandownerYields from "./LandownerYields.jsx";
import FaustmannRotation from "./FaustmannRotation.jsx";
import AOIReport from "./AOIReport.jsx";
import { findFeature, agbAtAge, polygonCentroid } from "./geo.js";

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
// CONUS overlay legends — colorbar stops + units + axis labels.
// v0.73 palettes inspired by ggsci R package (Nature, Lancet, GSEA, NPG).
const CONUS_LEGENDS = {
  lcms_2022: {
    title: "LCMS disturbance cause (2022)",
    type: "categorical",
    // NPG (Nature) — punchier, more discriminable
    stops: [
      ["#E64B35", "Wildfire"], ["#F39B7F", "Prescribed fire"],
      ["#DC0000", "Insect/drought"], ["#7E6148", "SPB"],
      ["#4DBBD5", "Wind"], ["#3C5488", "Snow/Ice"],
      ["#8491B4", "Mech land trans"], ["#91D1C2", "Tree removal"],
      ["#B09C85", "Defoliation"], ["#00A087", "Other loss"],
    ],
    note: "USFS LCMS v2024-10",
  },
  fortype_2022: {
    title: "TreeMap forest type group",
    type: "categorical",
    // NPG sea-green / sand-orange split
    stops: [
      ["#00A087", "Softwood"], ["#3C5488", "Mixedwood"],
      ["#E64B35", "Hardwood"], ["#999", "Nonforest / other"],
    ],
    note: "FIA FORTYPCD via TreeMap 2022",
  },
  rd_treemap: {
    title: "Relative density (RD)",
    type: "ramp",
    // Sequential lancet green
    ramp: ["#f0f8ed","#a8dba8","#42b540","#1d7e0f","#053d04"],
    lo: "0.0", mid: "0.5", hi: "1.5",
    note: "Chivehgenge (TreeMap 2022 basis)",
  },
  sdimax_treemap: {
    title: "Reineke SDI max",
    type: "ramp",
    // Viridis-like sequential
    ramp: ["#fde725","#5ec962","#21918c","#3b528b","#440154"],
    lo: "0", mid: "600", hi: "1500",
    note: "Trees per acre, TreeMap 2022 basis",
  },
  p_harvest_any: {
    title: "P(harvest · any), TM2016",
    type: "ramp",
    // GSEA-style hot diverging
    ramp: ["#ffe9e9","#ffc0e5","#ff7080","#d60c00","#7a0500"],
    lo: "0.0", mid: "0.5", hi: "1.0",
    note: "Probability per pixel (conus_hcs v1)",
  },
  p_harvest_clearcut: {
    title: "P(harvest · clearcut), TM2016",
    type: "ramp",
    ramp: ["#ffe9e9","#ffc0e5","#ff7080","#d60c00","#7a0500"],
    lo: "0.0", mid: "0.5", hi: "1.0",
    note: "Probability per pixel (conus_hcs v1)",
  },
  p_harvest_partial: {
    title: "P(harvest · partial), TM2016",
    type: "ramp",
    ramp: ["#ffe9e9","#ffc0e5","#ff7080","#d60c00","#7a0500"],
    lo: "0.0", mid: "0.5", hi: "1.0",
    note: "Probability per pixel (conus_hcs v1)",
  },
  climate_stress: {
    title: "CSPI · climate stress (v4, 1 km)",
    type: "ramp",
    // GSEA diverging (purple-low to red-high)
    ramp: ["#2300d1","#6b58ef","#c7c1ff","#ffc0e5","#ff7080","#d60c00"],
    lo: "low", mid: "mid", hi: "high",
    note: "Composite Site Productivity Index v4",
  },
  // v0.73 new layers
  bgi: {
    title: "BGI · bioclimatic growth index (1 km)",
    type: "ramp",
    // Lancet sequential
    ramp: ["#00468b","#0099b4","#42b540","#edc000","#ed0000"],
    lo: "low", mid: "mid", hi: "high",
    note: "Weiskittel & coauthors v2NEfix",
  },
  csi: {
    title: "CSI · climate site index (1 km)",
    type: "ramp",
    ramp: ["#00468b","#0099b4","#42b540","#edc000","#ed0000"],
    lo: "low", mid: "mid", hi: "high",
    note: "Weiskittel & coauthors v2NEfix",
  },
  csi_2030: {
    title: "CSI projection · 2030",
    type: "ramp",
    ramp: ["#00468b","#0099b4","#42b540","#edc000","#ed0000"],
    lo: "low", mid: "mid", hi: "high",
    note: "Future climate site index",
  },
  csi_2060: {
    title: "CSI projection · 2060",
    type: "ramp",
    ramp: ["#00468b","#0099b4","#42b540","#edc000","#ed0000"],
    lo: "low", mid: "mid", hi: "high",
    note: "Future climate site index",
  },
  csi_2090: {
    title: "CSI projection · 2090",
    type: "ramp",
    ramp: ["#00468b","#0099b4","#42b540","#edc000","#ed0000"],
    lo: "low", mid: "mid", hi: "high",
    note: "Future climate site index",
  },
};

// Tier B layer B: gcbm_rasters_2022 stack (per-state, 30 m) for all 6 non-ME
// trajectory states (MN GA IN WA OR ID). Single 2022 snapshot. Six layer types.
const GCBM_LAYERS = [
  { key:"carbon_l_2022", label:"Live tree carbon (Mg C/ha)",
    ramp:["#f7fcf5","#c7e9c0","#74c476","#238b45","#00441b"], lo:"0", hi:"200+" },
  { key:"balive_2022",   label:"Basal area live (sq ft/ac)",
    ramp:["#f7fbff","#c6dbef","#6baed6","#2171b5","#08306b"], lo:"0", hi:"200+" },
  { key:"stdage_2022",   label:"Stand age (years)",
    ramp:["#feedde","#fdbe85","#fd8d3c","#d94701","#7f2704"], lo:"0", hi:"180+" },
  { key:"dombio_l_2022", label:"Dead organic biomass (Mg/ha)",
    ramp:["#f7fcfd","#ccece6","#99d8c9","#66c2a4","#005824"], lo:"0", hi:"100+" },
  { key:"fortypcd_2022", label:"Forest type group (FIA)",
    ramp:["#238b45","#117733","#7570b3","#d95f02","#e6ab02"], lo:"softwood", hi:"hardwood" },
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
  const [showBands,setShowBands] = useState(true);  // v0.63: default ON
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
  // v0.62 interaction additions
  const [hiddenEngines,setHiddenEngines] = useState(new Set()); // per-engine hide
  const [hiddenClasses,setHiddenClasses] = useState(new Set()); // class-level hide
  const [yMode,setYMode] = useState("auto"); // v0.63: default to zoom-to-median so FVS outliers don't dominate
  const [compareOn,setCompareOn] = useState(false);
  const [cmpState,setCmpState] = useState("IN");
  const [cmpSeries,setCmpSeries] = useState(null);
  // v0.64 map-mode + year slider
  const [mapMode,setMapMode] = useState("coverage"); // coverage | carbon
  const [mapYear,setMapYear] = useState(2024);
  const [mapScenario,setMapScenario] = useState("harvest_baseline");
  const [timeline,setTimeline] = useState(null);
  // v0.65 SVG fallback for the choropleth
  const [geoData,setGeoData] = useState(null);
  const [mapEngine,setMapEngine] = useState("svg"); // svg (default robust) | maplibre
  // v0.66 scenario focus + simplification
  const [scenarioFocus,setScenarioFocus] = useState("all"); // all | harvest_baseline | libcbm_reduced | ...
  const [showAllEngines,setShowAllEngines] = useState(false); // false = auto-hide noisy variants
  // v0.67 CONUS-wide overlays
  const [conusLayer,setConusLayer] = useState("none"); // none | lcms_2022 | fortype_2022 | site_productivity | climate_stress
  const [conusOpacity,setConusOpacity] = useState(0.7);
  const [conusBounds,setConusBounds] = useState({}); // layer -> {x0,x1,y0,y1}
  // v0.70 chart interactions
  const [isolatedEngine,setIsolatedEngine] = useState(null);
  // v1.3 reconstruction: detail-panel tabs + their datasets
  const [tab,setTab] = useState("engines"); // engines | rd | divergence | stumpage
  const [divergence,setDivergence] = useState(null);
  const [stumpage,setStumpage] = useState(null);
  const [landis,setLandis] = useState(null);
  const [landowner,setLandowner] = useState(null);
  const [faustmann,setFaustmann] = useState(null);
  // v1.3 map/AOI tools
  const [ecoOn,setEcoOn] = useState(false);
  const [ecoGeo,setEcoGeo] = useState(null);
  const [l3yields,setL3yields] = useState(null);
  const [inspectMode,setInspectMode] = useState(false);
  const [inspectInfo,setInspectInfo] = useState(null);
  const [aoi,setAoi] = useState(null);
  const [playing,setPlaying] = useState(false);

  // ---- initial data + map ----
  useEffect(()=>{ (async()=>{
    const [m,s,geo,f,tl] = await Promise.all([
      j("api/meta.json"), j("api/states.json"), j("geo/us-states.geojson"), j("api/fia.json"),
      j("api/timeline.json").catch(()=>({}))]);
    setMeta(m); setStates(s); setFia(f); setTimeline(tl);
    // v1.3 tab datasets (non-blocking; tabs disable until loaded)
    j("api/engine_divergence.json").then(setDivergence).catch(()=>{});
    j("api/stumpage.json").then(setStumpage).catch(()=>{});
    j("api/landis_stratified.json").then(setLandis).catch(()=>{});
    j("api/landowner_yields.json").then(setLandowner).catch(()=>{});
    j("api/faustmann_rotation.json").then(setFaustmann).catch(()=>{});
    geo.features.forEach(ft=>{ const st=ft.properties.state; const c=s[st];
      ft.properties.engines = c ? c.engines : 0;
      ft.properties.hasSeries = (c && c.has_series) ? 1 : 0;
      ft.properties.focal = FOCAL.includes(st) ? 1 : 0; });
    setGeoData(geo);
    // SVG is the default robust map; maplibre stays available for raster overlays.
    if(mapEngine !== "maplibre"){ setMapReady(true); return; }
    const mp = new maplibregl.Map({ container: mapEl.current,
      style:{ version:8, sources:{},
        layers:[{id:"bg",type:"background",paint:{"background-color":"#0b1015"}}] },
      center:[-96,38], zoom:3, attributionControl:false });
    map.current = mp;
    // Defensive: force resize after layout in case the grid container hadn't
    // settled when maplibre measured (some browsers race on grid + ResizeObserver).
    setTimeout(()=>{ try{ mp.resize(); }catch(e){} }, 250);
    window.addEventListener("resize", ()=>{ try{ mp.resize(); }catch(e){} });
    mp.on("load",()=>{
      mp.addSource("states",{ type:"geojson", data:geo, promoteId:"state" });
      mp.addLayer({ id:"fill", type:"fill", source:"states", paint:{
        "fill-color":["case",["==",["get","engines"],0],"#2a3a47",
          ["step",["get","engines"],"#9ad9b8",4,"#54b88a",6,"#2f9e6a",20,"#1b7a4d"]],
        "fill-opacity":["case",["==",["get","focal"],1],0.98,
          ["case",["==",["get","hasSeries"],1],0.85,0.55]] }});
      mp.addLayer({ id:"line", type:"line", source:"states",
        paint:{"line-color":"#0b1015","line-width":0.7} });
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

  // ---- map mode: re-paint per-state by carbon at chosen year/scenario ----
  // Uses maplibre feature-state (keyed by state code via promoteId:"state")
  // which avoids mutating the geojson source.
  useEffect(()=>{ const mp=map.current; if(!mp || !mapReady || !mp.getLayer("fill")) return;
    try{
      if(mapMode === "coverage"){
        mp.setPaintProperty("fill","fill-color",
          ["case",["==",["get","engines"],0],"#2a3a47",
           ["step",["get","engines"],"#9ad9b8",4,"#54b88a",6,"#2f9e6a",20,"#1b7a4d"]]);
        mp.setPaintProperty("fill","fill-opacity",
          ["case",["==",["get","focal"],1],0.98,
           ["case",["==",["get","hasSeries"],1],0.85,0.55]]);
        return;
      }
      // carbon mode: set feature-state per state code, then color by it
      const yrKey = String(mapYear);
      const allStates = Object.keys(states || {});
      // Set carbon for every state via feature-state (null if no data)
      const geoFeatures = mp.getSource("states") && mp.getSource("states")._data && mp.getSource("states")._data.features;
      const featureStates = geoFeatures ? geoFeatures.map(ft=>ft.properties.state) : allStates;
      featureStates.forEach(st=>{
        const v = (timeline && timeline[st] && timeline[st][mapScenario] && timeline[st][mapScenario][yrKey]);
        mp.setFeatureState({source:"states", id: st}, {carbonTg: (v != null ? v : -1)});
      });
      mp.setPaintProperty("fill","fill-color",
        ["case",["<",["coalesce",["feature-state","carbonTg"],-1],0],"#2a3a47",
         ["interpolate",["linear"],["feature-state","carbonTg"],
           0,"#edf8e9", 100,"#bae4b3", 300,"#74c476", 500,"#31a354", 1000,"#005a32"]]);
      mp.setPaintProperty("fill","fill-opacity",
        ["case",["<",["coalesce",["feature-state","carbonTg"],-1],0],0.35,0.92]);
    }catch(err){ console.warn("[map] repaint error", err); }
  },[mapMode, mapYear, mapScenario, mapReady, timeline, states]);

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
      // v0.69+: store raw json so SVGMap can handle both formats
      // (Albers meters {x0,y0,x1,y1} OR legacy WGS84 corners {ul,ur,lr,ll}).
      // maplibre code path still needs the legacy 4-point format.
      if(b.x0 != null){
        // synthesize the maplibre 4-point format from the meter extent if needed
        setGcbmBounds(prev=>({...prev,[stLow]: b}));
      } else {
        const coords = [[b.ul[0],b.ul[1]],[b.ur[0],b.ur[1]],[b.lr[0],b.lr[1]],[b.ll[0],b.ll[1]]];
        coords.raw = b;
        setGcbmBounds(prev=>({...prev,[stLow]: coords}));
      }
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

  // ---- RD tab pins the relative-density metric on entry ----
  useEffect(()=>{ if(tab==="rd" && series && series.rd_mean_wtd) setMetric("rd_mean_wtd"); },[tab,series]);

  // ---- fall back to Engine compare if the active tab has no data here ----
  useEffect(()=>{
    const ok = {
      engines: !!series, rd: !!series, divergence: !!divergence,
      stumpage: !!(stumpage && stumpage.series && stumpage.series[sel]),
      landis: !!(landis && landis[sel]),
      landowner: !!(landowner && landowner[sel]),
      faustmann: !!(faustmann && faustmann[sel]),
    };
    if(!ok[tab]) setTab("engines");
  },[sel,series,divergence,stumpage,landis,landowner,faustmann]);

  // ---- lazy-load ecoregion geojson + L3 yields when a map/AOI tool needs them ----
  useEffect(()=>{
    if(!(ecoOn || inspectMode || aoi)) return;
    if(!ecoGeo) j("geo/us_eco_l3_features.geojson").then(setEcoGeo).catch(()=>{});
    if(!l3yields) j("api/yield_curves_by_l3.json").then(setL3yields).catch(()=>{});
  },[ecoOn,inspectMode,aoi,ecoGeo,l3yields]);

  // ---- carbon-map year animation (play/pause) ----
  useEffect(()=>{
    if(!(playing && mapMode==="carbon")) return;
    const id = setInterval(()=> setMapYear(y => y>=2074 ? 2024 : y+5), 700);
    return ()=> clearInterval(id);
  },[playing,mapMode]);

  // ---- lazy-load CONUS overlay bounds.json ----
  useEffect(()=>{
    if(conusLayer === "none" || conusBounds[conusLayer]) return;
    j(`raster/conus_${conusLayer}_bounds.json`)
      .then(b => setConusBounds(prev => ({...prev, [conusLayer]: b})))
      .catch(() => {});
  },[conusLayer, conusBounds]);

  // ---- load compare-state series (separate from primary) ----
  useEffect(()=>{
    if(!compareOn || !cmpState || cmpState === sel){ setCmpSeries(null); return; }
    if(!states || !states[cmpState] || !states[cmpState].has_series){ setCmpSeries(null); return; }
    j(`api/series/${cmpState}.json`).then(setCmpSeries).catch(()=>setCmpSeries(null));
  },[compareOn, cmpState, sel, states]);

  const cov = states && states[sel];
  const rawNode = series && series[metric] && series[metric][bucket];
  // v0.66 auto-hide noisy engines unless user opts into "show all":
  //   uncalibrated FVS variants (native/jenkins not anchored or calibrated)
  //   quarantined wear-nh series (already retired in v0.52 but may leak)
  const isOutlier = (eng) =>
    /(fvs.*(native|jenkins))/i.test(eng) && !/(anchored|calibrated)/i.test(eng) ||
    /wear_nh/i.test(eng);
  const filteredByClass = rawNode ? rawNode.filter(s => !hiddenClasses.has(s.cls)) : null;
  const filteredByOutlier = (filteredByClass && !showAllEngines)
    ? filteredByClass.filter(s => !isOutlier(s.model))
    : filteredByClass;
  // v0.66 scenario focus: when set, replace engine view with libcbm-only trajectory
  // for that scenario, sourced from timeline.json (per-scenario per-year AGC).
  const scenarioNode = (scenarioFocus !== "all" && timeline && timeline[sel]
                        && timeline[sel][scenarioFocus]
                        && metric === "agc_live_total")
    ? [{
        model: `libcbm_cross_state_v2 · ${scenarioFocus}`,
        cls: "CBM",
        label: `libcbm cross-state v2 · ${scenarioFocus.replace(/_/g," ")}`,
        pts: Object.keys(timeline[sel][scenarioFocus]).sort()
                .map(y => [+y, timeline[sel][scenarioFocus][y]]),
      }]
    : null;
  const node = scenarioNode || filteredByOutlier;
  const overlayNode = (compareOn && cmpSeries && cmpSeries[metric] && cmpSeries[metric][bucket])
    ? cmpSeries[metric][bucket].filter(s => !hiddenClasses.has(s.cls))
                              .filter(s => showAllEngines || !isOutlier(s.model))
    : null;
  const metricsAvail = series ? Object.keys(series).sort(
    (a,b)=> (METRIC_ORDER.indexOf(a)+1||99) - (METRIC_ORDER.indexOf(b)+1||99)) : [];
  const hasCarbon = metricsAvail.some(m=>CARBON.includes(m));
  const bucketsAvail = series && series[metric] ? Object.keys(series[metric]) : [];
  const hasBands = !!(node && node.some(s=> s.pts.some(p=> p.length>=4)));
  const fiaRef = (metric==="agc_live_total" && fia[sel]) ? fia[sel].tg_agc : null;
  const mlabel = (mc)=> (meta && meta.metrics[mc]) ? meta.metrics[mc].label : mc;
  const allEngines = rawNode ? [...new Set(rawNode.map(s=>s.model))].sort() : [];
  const allClasses = rawNode ? [...new Set(rawNode.map(s=>s.cls))].sort() : [];
  const toggleEngine = (eng) => {
    const next = new Set(hiddenEngines);
    next.has(eng) ? next.delete(eng) : next.add(eng);
    setHiddenEngines(next);
  };
  const toggleClass = (cls) => {
    const next = new Set(hiddenClasses);
    next.has(cls) ? next.delete(cls) : next.add(cls);
    setHiddenClasses(next);
  };
  const seriesStates = states ? Object.keys(states).filter(st => states[st].has_series).sort() : [];

  // ecoregion fill by AGB at 50 yr (untreated), green ramp 0..150 ton/ac
  const ecoFill = l3yields ? (code)=>{
    const e = l3yields.l3 && l3yields.l3[code];
    const v = agbAtAge(e, 50, "untreated");
    if(v == null) return null;
    const t = Math.max(0, Math.min(1, v/150));
    const stops = [[237,248,233],[116,196,118],[0,90,50]];
    const [a,b,f] = t<0.5 ? [stops[0],stops[1],t/0.5] : [stops[1],stops[2],(t-0.5)/0.5];
    const rgb = [0,1,2].map(k=>Math.round(a[k]+f*(b[k]-a[k])));
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  } : null;

  const handleInspect = (lon,lat)=>{
    const sf = geoData && findFeature(geoData.features, lon, lat);
    const ef = ecoGeo && findFeature(ecoGeo.features, lon, lat);
    const code = ef && ef.properties && ef.properties.NA_L3CODE;
    const l3e = (l3yields && l3yields.l3 && code) ? l3yields.l3[code] : null;
    setInspectInfo({ lon, lat,
      state: sf && sf.properties && sf.properties.state,
      l3code: code, l3name: ef && ef.properties && ef.properties.NA_L3NAME,
      l1: ef && ef.properties && ef.properties.NA_L1NAME,
      agb50: agbAtAge(l3e, 50, "untreated"),
      curves: l3e && l3e.curves && l3e.curves.agb_tonac });
  };

  const handleAoiFile = async (file)=>{
    if(!file) return;
    try{
      let gj;
      if(/\.zip$/i.test(file.name)){
        const shp = (await import("shpjs")).default;
        gj = await shp(await file.arrayBuffer());
      } else {
        gj = JSON.parse(await file.text());
      }
      const feats = gj.features || (gj.type === "Feature" ? [gj] : []);
      const poly = feats.find(f=>f.geometry && /Polygon/.test(f.geometry.type));
      if(!poly){ alert("No polygon found in that file."); return; }
      const c = polygonCentroid(poly.geometry);
      let eg = ecoGeo, ly = l3yields;
      if(!eg){ eg = await j("geo/us_eco_l3_features.geojson"); setEcoGeo(eg); }
      if(!ly){ ly = await j("api/yield_curves_by_l3.json"); setL3yields(ly); }
      const ef = findFeature(eg.features, c[0], c[1]);
      const code = ef && ef.properties.NA_L3CODE;
      const l3e = (ly.l3 && code) ? ly.l3[code] : null;
      const nVerts = poly.geometry.type === "Polygon"
        ? poly.geometry.coordinates[0].length
        : poly.geometry.coordinates[0][0].length;
      setAoi({ name:file.name, centroid:c, nVerts, l3code:code,
        l3name: ef && ef.properties.NA_L3NAME, l1: ef && ef.properties.NA_L1NAME,
        curves: l3e && l3e.curves && l3e.curves.agb_tonac });
    }catch(err){ console.error("AOI parse failed", err); alert("Could not read AOI file: "+err.message); }
  };

  return (
    <div className="app">
      <header className="top">
        <h1>PERSEUS Forest Intelligence <span className="pill">Tier A</span></h1>
        <span className="sub">Focal: <b style={{color:"#f4c430"}}>ME · IN · GA</b> · click map or pick a state →</span>
        {seriesStates.length>0 && (
          <select className="state-pick" value={sel} onChange={e=>setSel(e.target.value)} title="Jump to state">
            {seriesStates.map(st=>{
              const c = states[st];
              const focal = FOCAL.includes(st) ? " ★" : "";
              return <option key={st} value={st}>{st} · {c.name}{focal} · {c.engines}eng · {c.rows.toLocaleString()} rows</option>;
            })}
          </select>)}
        <span className="stat">{meta && `${meta.stats.states} states · ${meta.stats.engines} engines · ${meta.stats.metrics} metrics · ${Number(meta.stats.rows).toLocaleString()} rows`}</span>
      </header>
      <div className="main">
        <div className="mapwrap">
          <div className="maptitle">{mapMode === "coverage"
            ? "Coverage — engines per state"
            : `Carbon — libcbm AGC (Tg), ${mapScenario.replace(/_/g," ")}, year ${mapYear}`}</div>
          {mapEngine === "maplibre"
            ? <div id="map" ref={mapEl}></div>
            : (()=>{
                const stLow = sel.toLowerCase();
                const stOverlayActive = gcbmOn && states && states[sel] && states[sel].has_tier_b && !LANDIS_STATES.includes(sel) && gcbmBounds[stLow];
                const stOverlayUrl = stOverlayActive ? `${BASE}raster/${stLow}_${gcbmLayer}.png` : null;
                // Pass raw json if Albers-meters format, else synthesize ul/ur/lr/ll
                const stOverlayB = stOverlayActive ? (()=>{
                  const c = gcbmBounds[stLow];
                  if(!c) return null;
                  if(c.x0 != null) return c;  // Albers meters
                  return {ul:c[0], ur:c[1], lr:c[2], ll:c[3]};
                })() : null;
                return (
                <div id="map" style={{position:"absolute",inset:0,padding:"6px"}}>
                  <SVGMap geo={geoData} states={states} focal={FOCAL}
                          mode={mapMode} timeline={timeline}
                          mapYear={mapYear} mapScenario={mapScenario}
                          selected={sel} onPick={st=>setSel(st)}
                          conusOverlay={conusLayer !== "none" && conusBounds[conusLayer]
                                        ? `${BASE}raster/conus_${conusLayer}.png` : null}
                          conusOverlayBounds={conusLayer !== "none" ? conusBounds[conusLayer] : null}
                          conusOverlayOpacity={conusOpacity}
                          stateOverlay={stOverlayUrl}
                          stateOverlayBounds={stOverlayB}
                          stateOverlayOpacity={gcbmOpacity}
                          ecoData={ecoOn ? ecoGeo : null}
                          ecoFill={ecoFill}
                          inspectMode={inspectMode}
                          onInspect={handleInspect}/>
                </div>);
              })()}
          <div className="map-ctrl">
            <select value={mapMode} onChange={e=>setMapMode(e.target.value)} title="Map mode">
              <option value="coverage">map: engine coverage</option>
              <option value="carbon">map: carbon trajectory (libcbm)</option>
            </select>
            <select value={conusLayer} onChange={e=>setConusLayer(e.target.value)} title="CONUS overlay">
              <option value="none">CONUS layer: off</option>
              <optgroup label="Disturbance / Harvest (TM2016)">
                <option value="lcms_2022">LCMS disturbance cause 2022</option>
                <option value="p_harvest_any">P(harvest · any)</option>
                <option value="p_harvest_clearcut">P(harvest · clearcut)</option>
                <option value="p_harvest_partial">P(harvest · partial)</option>
              </optgroup>
              <optgroup label="Forest structure (TreeMap 2022)">
                <option value="fortype_2022">Forest type</option>
                <option value="rd_treemap">Relative density · Chivehgenge</option>
                <option value="sdimax_treemap">SDI max · Reineke</option>
              </optgroup>
              <optgroup label="Site productivity / Climate">
                <option value="bgi">BGI · Bioclimatic Growth Index</option>
                <option value="csi">CSI · Climate Site Index</option>
                <option value="climate_stress">CSPI · Composite SPI (v4)</option>
              </optgroup>
              <optgroup label="CSI future projections">
                <option value="csi_2030">CSI · 2030</option>
                <option value="csi_2060">CSI · 2060</option>
                <option value="csi_2090">CSI · 2090</option>
              </optgroup>
            </select>
            {conusLayer !== "none" && (
              <input type="range" min="0.2" max="1" step="0.05" value={conusOpacity}
                onChange={e=>setConusOpacity(+e.target.value)}
                title={`CONUS overlay opacity: ${conusOpacity}`} style={{width:80}}/>
            )}
            <label className="mc-tog" title="EPA L3 ecoregion overlay, colored by AGB at 50 yr">
              <input type="checkbox" checked={ecoOn} onChange={e=>setEcoOn(e.target.checked)}/> ecoregions
            </label>
            <label className="mc-tog" title="click the map to inspect a point (state, L3 ecoregion, AGB at 50 yr)">
              <input type="checkbox" checked={inspectMode}
                onChange={e=>{ setInspectMode(e.target.checked); if(!e.target.checked) setInspectInfo(null); }}/> inspect
            </label>
            <label className="mc-tog" title="upload an AOI: GeoJSON or zipped shapefile">
              AOI ↑<input type="file" accept=".zip,.json,.geojson" style={{display:"none"}}
                onChange={e=>handleAoiFile(e.target.files[0])}/>
            </label>
            {mapMode === "carbon" && timeline && (<>
              <select value={mapScenario} onChange={e=>setMapScenario(e.target.value)} title="Scenario">
                <option value="harvest_baseline">BAU (baseline harvest)</option>
                <option value="libcbm_reduced">aggressive reduce</option>
                <option value="libcbm_intensified">aggressive intensify</option>
                <option value="libcbm_climate_smart">climate-smart</option>
                <option value="harvest_rcp45">BAU + RCP 4.5</option>
                <option value="noharvest_rcp45">reserve + RCP 4.5</option>
              </select>
              <button onClick={()=>setPlaying(p=>!p)} title={playing?"pause":"play animation"}
                style={{background:"var(--panel)",color:"var(--ink)",border:"1px solid var(--line)",
                  borderRadius:5,padding:"2px 8px",fontSize:12,cursor:"pointer"}}>
                {playing ? "❚❚" : "▶"}</button>
              <input type="range" min={2024} max={2074} step={5}
                value={mapYear} onChange={e=>setMapYear(+e.target.value)}
                title={`Year: ${mapYear}`} style={{width:140}}/>
              <span style={{color:"var(--mut)",fontSize:11,fontVariantNumeric:"tabular-nums"}}>{mapYear}</span>
            </>)}
          </div>
          {inspectInfo && (
            <div className="inspect-pop">
              <button className="aoi-x" onClick={()=>setInspectInfo(null)} title="close">×</button>
              <div><b>{inspectInfo.lat.toFixed(3)}°, {inspectInfo.lon.toFixed(3)}°</b></div>
              <div>State: <b>{inspectInfo.state || "—"}</b></div>
              <div>EPA L3: {inspectInfo.l3code || "—"} {inspectInfo.l3name || ""}</div>
              {inspectInfo.l1 && <div style={{color:"var(--mut)",fontSize:10.5}}>{inspectInfo.l1}</div>}
              <div>AGB @50yr: <b>{inspectInfo.agb50 != null ? `${inspectInfo.agb50.toFixed(0)} ton/ac` : "n/a"}</b></div>
              {inspectInfo.curves && (
                <button className="mini-btn" onClick={()=> setAoi({
                  name:`point ${inspectInfo.lat.toFixed(2)}, ${inspectInfo.lon.toFixed(2)}`,
                  centroid:[inspectInfo.lon,inspectInfo.lat], l3code:inspectInfo.l3code,
                  l3name:inspectInfo.l3name, l1:inspectInfo.l1, curves:inspectInfo.curves })}>
                  project this point →</button>)}
            </div>)}
          {ecoOn && (
            <div className="legend" style={{left:"auto",right:12,bottom:44}}>
              <div style={{marginBottom:4}}>EPA L3 · AGB at 50 yr (ton/ac)</div>
              <div style={{height:10,width:150,borderRadius:2,
                background:"linear-gradient(90deg,#edf8e9,#74c476,#005a32)"}}></div>
              <div style={{display:"flex",justifyContent:"space-between",width:150,fontSize:10.5}}>
                <span>0</span><span>75</span><span>150+</span>
              </div>
            </div>)}
          {mapMode === "coverage" && (
            <div className="legend">
              <div style={{marginBottom:3}}><i style={{background:"transparent",border:"2px solid #f4c430"}}></i>PERSEUS focal (ME · IN · GA)</div>
              <div><i style={{background:"#1b7a4d"}}></i>20+ &nbsp;<i style={{background:"#2f9e6a"}}></i>6–19 &nbsp;<i style={{background:"#54b88a"}}></i>4–5 &nbsp;<i style={{background:"#9ad9b8"}}></i>1–3</div>
              <div><i style={{background:"#2a3a47"}}></i>no model data yet</div>
            </div>)}
          {mapMode === "carbon" && (
            <div className="legend">
              <div style={{marginBottom:4}}>libcbm AGC (Tg, state total)</div>
              <div style={{height:10,width:160,borderRadius:2,
                background:"linear-gradient(90deg,#edf8e9,#bae4b3,#74c476,#31a354,#005a32)"}}></div>
              <div style={{display:"flex",justifyContent:"space-between",width:160,fontSize:10.5}}>
                <span>0</span><span>300</span><span>1000+</span>
              </div>
              <div style={{marginTop:4,color:"var(--mut)",fontSize:10}}>states without libcbm cross-state v2 grey</div>
            </div>)}
          {conusLayer !== "none" && CONUS_LEGENDS[conusLayer] && (() => {
            const lg = CONUS_LEGENDS[conusLayer];
            return (
            <div className="legend" style={{left:"auto",right:12,maxWidth:200}}>
              <div style={{marginBottom:4,fontWeight:600,color:"var(--ink)"}}>{lg.title}</div>
              {lg.type === "ramp" ? <>
                <div style={{height:10,width:180,borderRadius:2,
                  background:`linear-gradient(90deg,${lg.ramp.join(",")})`}}></div>
                <div style={{display:"flex",justifyContent:"space-between",width:180,fontSize:10.5}}>
                  <span>{lg.lo}</span><span>{lg.mid}</span><span>{lg.hi}</span>
                </div>
              </> : <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"2px 8px",marginTop:2}}>
                {lg.stops.map(([col,lbl])=>
                  <span key={lbl} style={{fontSize:10,whiteSpace:"nowrap"}}>
                    <i style={{display:"inline-block",width:9,height:9,background:col,
                      borderRadius:2,marginRight:4,verticalAlign:"middle"}}/>{lbl}
                  </span>)}
              </div>}
              {lg.note && <div style={{marginTop:5,color:"var(--mut)",fontSize:10,fontStyle:"italic"}}>{lg.note}</div>}
            </div>);})()}
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
          <div className="tabs">
            {[["engines","Engine compare"],["rd","RD trend"],["divergence","Engine spread"],
              ["stumpage","Stumpage"],["landis","LANDIS stratified"],
              ["landowner","Landowner yields"],["faustmann","Faustmann rotation"]].map(([k,lbl])=>{
              const disabled = (k==="divergence" && !divergence)
                || (k==="stumpage" && !(stumpage && stumpage.series && stumpage.series[sel]))
                || (k==="landis" && !(landis && landis[sel]))
                || (k==="landowner" && !(landowner && landowner[sel]))
                || (k==="faustmann" && !(faustmann && faustmann[sel]))
                || ((k==="engines"||k==="rd") && !series);
              return <button key={k} className={"tab"+(tab===k?" on":"")} disabled={disabled}
                onClick={()=>setTab(k)} title={disabled?"no data for this state":lbl}>{lbl}</button>;
            })}
          </div>
          <div className="who">{cov ? <><b>{cov.name}</b> <span style={{color:"var(--mut)"}}>· {cov.engines} engines · {cov.metrics} metrics · {cov.rows.toLocaleString()} rows</span></> : sel}</div>
          {aoi && <AOIReport aoi={aoi} onClose={()=>setAoi(null)}/>}
          {tab==="divergence" && <DivergenceHeatmap data={divergence} selected={sel}
            onPickState={st=>{ if(states && states[st] && states[st].has_series){ setSel(st); setTab("engines"); } }}/>}
          {tab==="stumpage" && <StumpagePanel data={stumpage} state={sel}/>}
          {tab==="landis" && <LandisStratified data={landis} state={sel}/>}
          {tab==="landowner" && <LandownerYields data={landowner} state={sel}/>}
          {tab==="faustmann" && <FaustmannRotation data={faustmann} state={sel}/>}
          {(tab==="engines"||tab==="rd") && (<>
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
              <select value={scenarioFocus} onChange={e=>setScenarioFocus(e.target.value)}
                      title="Pick a specific libcbm scenario, or 'all engines' for the full multi-model view">
                <option value="all">all engines · {bucket}</option>
                <option value="harvest_baseline">libcbm BAU only</option>
                <option value="libcbm_reduced">libcbm reduce only</option>
                <option value="libcbm_intensified">libcbm intensify only</option>
                <option value="libcbm_climate_smart">libcbm climate-smart only</option>
                <option value="harvest_rcp45">libcbm BAU + RCP4.5</option>
                <option value="noharvest_rcp45">libcbm reserve + RCP4.5</option>
              </select>
              {scenarioFocus === "all" && (
                <select value={bucket} onChange={e=>setBucket(e.target.value)}>
                  {bucketsAvail.map(b=> <option key={b} value={b}>{b}</option>)}
                </select>)}
              <select value={yMode} onChange={e=>setYMode(e.target.value)} title="Y-axis scaling">
                <option value="full">Y: full range</option>
                <option value="auto">Y: zoom to median (q10–q90)</option>
                <option value="log">Y: log scale</option>
              </select>
              <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--mut)"}}>
                <input type="checkbox" checked={showAllEngines} onChange={e=>setShowAllEngines(e.target.checked)}/> show all engines
              </label>
              {hasBands && <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--mut)"}}>
                <input type="checkbox" checked={showBands} onChange={e=>setShowBands(e.target.checked)}/> uncertainty
              </label>}
              <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,color:"var(--mut)"}}>
                <input type="checkbox" checked={compareOn} onChange={e=>setCompareOn(e.target.checked)}/> compare
              </label>
              {compareOn && (
                <select value={cmpState} onChange={e=>setCmpState(e.target.value)} title="Second state to overlay">
                  {seriesStates.filter(st=>st!==sel).map(st=>
                    <option key={st} value={st}>vs {st} ({states[st].name})</option>)}
                </select>)}
            </div>
            {allClasses.length>1 && (
              <div className="lgd" style={{marginTop:0,marginBottom:6,gap:"3px 10px"}}>
                <span style={{color:"var(--mut)",marginRight:4}}>classes:</span>
                {allClasses.map(c=>{
                  const off = hiddenClasses.has(c);
                  return <button key={c} className="filt" onClick={()=>toggleClass(c)}
                    style={{background:off?"transparent":CLASS_COL[c]||"#bbb",
                      color:off?"var(--mut)":"#0b1015", border:`1px solid ${CLASS_COL[c]||"#bbb"}`,
                      borderRadius:6,padding:"1px 7px",fontSize:11,cursor:"pointer",
                      opacity:off?0.55:1}}>{c}{off?" (off)":""} · {rawNode.filter(s=>s.cls===c).length}</button>;
                })}
                {fiaRef && <span style={{marginLeft:8}}><i style={{background:"#9fb3c0"}}></i>FIA observed</span>}
              </div>)}
            <div className="chartcard">
              <GrowthChart node={node} fiaRef={fiaRef} fiaYear={fia[sel] && fia[sel].year}
                unit={meta && meta.metrics[metric] && meta.metrics[metric].unit} classCol={CLASS_COL}
                showBands={showBands && hasBands}
                hiddenEngines={hiddenEngines} yMode={yMode}
                overlayNode={overlayNode} overlayLabel={cmpState}
                isolatedEngine={isolatedEngine} onIsolate={setIsolatedEngine}/>
            </div>
            {allEngines.length>1 && (
              <details style={{margin:"6px 4px 0",fontSize:12,color:"var(--mut)"}}>
                <summary style={{cursor:"pointer"}}>per-engine toggle ({allEngines.length} engines · {hiddenEngines.size} hidden)</summary>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6,alignItems:"center"}}>
                  <button onClick={()=>{
                    // hide every FVS native/jenkins variant (outliers), keep anchored/calibrated
                    const next = new Set(hiddenEngines);
                    allEngines.forEach(e=>{
                      if(/fvs.*(native|jenkins)(?!.*anchored)/i.test(e) && !/anchored|calibrated/i.test(e)){
                        next.add(e);
                      }
                    });
                    setHiddenEngines(next);
                  }} style={{background:"transparent",color:"#f4c430",border:"1px dashed #f4c430",
                    borderRadius:5,padding:"1px 8px",fontSize:10.5,cursor:"pointer",fontWeight:600}}>
                    hide FVS outliers
                  </button>
                  <button onClick={()=>setHiddenEngines(new Set())}
                    style={{background:"transparent",color:"var(--accent)",border:"1px dashed var(--accent)",
                      borderRadius:5,padding:"1px 8px",fontSize:10.5,cursor:"pointer"}}>show all</button>
                  <span style={{color:"var(--mut)",margin:"0 4px"}}>|</span>
                  {allEngines.map(eng=>{
                    const off = hiddenEngines.has(eng);
                    const cls = rawNode.find(s=>s.model===eng)?.cls;
                    const col = CLASS_COL[cls] || "#bbb";
                    return <button key={eng} onClick={()=>toggleEngine(eng)}
                      style={{background:off?"transparent":col+"33",
                        color:off?"var(--mut)":"var(--ink)",border:`1px solid ${col}`,
                        borderRadius:5,padding:"1px 6px",fontSize:10.5,cursor:"pointer",
                        textDecoration:off?"line-through":"none"}}
                      title={off?"show":"hide"}>{eng.replace(/_/g," ").slice(0,28)}</button>;
                  })}
                </div>
              </details>)}
            <div className="note">
              {scenarioFocus === "all"
                ? <>Each solid line is one engine's median for <b>{mlabel(metric)}</b> under <b>{bucket}</b>
                    {node && ` (${node.filter(s=>!hiddenEngines.has(s.model)).length} visible / ${rawNode.length})`}.
                    {" "}Uncalibrated FVS variants are hidden by default — use <b>show all engines</b> to expose them.
                    {compareOn && overlayNode && <> Dashed = <b>{cmpState}</b> ({overlayNode.length} engines).</>}</>
                : <>Showing libcbm cross-state v2 trajectory for <b>{scenarioFocus.replace(/_/g," ")}</b> only.
                    Switch to "all engines" to see the full multi-model spread under managed/reserve buckets.</>}
              {" "}Class buttons hide whole model families; the per-engine drawer hides individual engines.
              Y-axis "zoom to median" hides outliers. Hover a line for the engine. Data: perseus_db v0.66.
            </div>
          </>)}
          </>)}
        </div>
      </div>
    </div>
  );
}
