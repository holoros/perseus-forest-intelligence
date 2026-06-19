// Plain-language glossary + sources overlay. Lowers the jargon barrier for
// non-modelers and makes the methods/citations visible (trust for skeptical
// audiences). Pure, dependency-free; closes on backdrop click or the X.
const TERMS = [
  ["Above-ground live carbon (AGC)", "Carbon stored in living trees above the soil. Reported in Tg C (teragrams = million metric tons)."],
  ["Above-ground biomass (AGB)", "Total dry weight of living trees above ground; carbon is roughly half of it."],
  ["Relative density (RD)", "How full a stand is versus the most it could hold. 0.30 to 0.60 is the management sweet spot: strong growth, low density-driven mortality."],
  ["Forest stress (health layer)", "How much pressure a forest is under, from species climate vulnerability plus observed disturbance. Scored 0 to 1."],
  ["Forest resilience (health layer)", "A forest's capacity to absorb that pressure, from its structure and adaptive capacity. Scored 0 to 1."],
  ["Priority forest area", "Forest that is high-stress and low-resilience, where management attention is most warranted. Quote it as a range, not a single number."],
  ["Climate exposure", "Projected climate pressure on the species present in a stand (the Potter Climate Exposure component)."],
  ["Climate vulnerability (VCC)", "How exposed, sensitive, and adaptive a species is to climate change, from Potter, Crane and Hargrove (2017)."],
  ["Faustmann rotation", "The harvest age that maximizes long-run economic value of a stand."],
  ["Scenarios (Current / RCP4.5 / RCP8.5)", "No, central, and high-end climate warming pathways. RCP8.5 is a high-end bound now considered unlikely."],
  ["Model families (CBM, CEM, FVS, LANDIS, yield curves)", "The different forest-carbon models the tool compares. Agreement across them builds confidence; spread between them is real uncertainty."],
  ["Uncertainty band", "The range a number could plausibly take. Always read the range, not just the central line."],
];
const SOURCES = [
  "FIA: USDA Forest Service Forest Inventory and Analysis (observed inventory anchor).",
  "Potter, Crane & Hargrove (2017), Project CAPTURE: species climate vulnerability.",
  "Model families: libcbm / GCBM, CEM, FVS (Bayesian), LANDIS-II, and FIADB/TreeMap yield curves.",
];

export default function GlossaryPanel({ onClose }){
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(5,8,11,0.6)",
      zIndex:1000, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"6vh 12px" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"var(--panel,#10171d)", color:"var(--ink,#e8edf2)",
        border:"1px solid var(--line,#2a3a47)", borderRadius:10, maxWidth:620, width:"100%",
        maxHeight:"82vh", overflow:"auto", padding:"16px 18px", boxShadow:"0 12px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
          <b style={{ fontSize:16 }}>Glossary &amp; sources</b>
          <button onClick={onClose} aria-label="close" style={{ background:"transparent", border:"none",
            color:"var(--mut,#8a93a0)", fontSize:20, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
        <div style={{ fontSize:12.5, color:"var(--mut)", marginBottom:10 }}>
          Plain-language definitions for the tool's terms, and the data and models behind the numbers.
        </div>
        {TERMS.map(([t,d]) => (
          <div key={t} style={{ margin:"0 0 9px" }}>
            <div style={{ fontSize:13, fontWeight:600 }}>{t}</div>
            <div style={{ fontSize:12.5, color:"var(--ink)", opacity:0.92, lineHeight:1.4 }}>{d}</div>
          </div>
        ))}
        <div style={{ fontSize:13, fontWeight:600, margin:"12px 0 4px", color:"var(--accent,#3fb68b)" }}>Sources</div>
        {SOURCES.map((s,i) => (
          <div key={i} style={{ fontSize:12, color:"var(--mut)", lineHeight:1.4, margin:"0 0 3px" }}>· {s}</div>
        ))}
      </div>
    </div>
  );
}
