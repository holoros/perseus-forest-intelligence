// Precompute per-state permanence / reversal-risk summary from the committed
// per-state series, so the Permanence choropleth reads one small file instead
// of loading all 48 state series in the browser.
// Output: public/api/permanence_risk.json
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const DIR = "public/api/series";
const B = { base:"reserve (no harvest)",
            dist:"reserve (no harvest, disturbance-exposed)",
            mort:"reserve (no harvest, mortality-stressed)" };
const PREF = ["agc_live_total","agb_dry","agc_live_ag","bgc_live_total","vol_stem"];

const medianByYear = arr => {
  if(!arr || !arr.length) return [];
  const byYr = {};
  arr.forEach(s => (s.pts||[]).forEach(p => {
    if(p[1]==null || Number.isNaN(p[1])) return;
    (byYr[p[0]] = byYr[p[0]] || []).push(p[1]);
  }));
  return Object.keys(byYr).map(Number).sort((a,b)=>a-b).map(y=>{
    const v = byYr[y].slice().sort((a,b)=>a-b);
    const m = v.length%2 ? v[(v.length-1)/2] : (v[v.length/2-1]+v[v.length/2])/2;
    return [y,m];
  });
};
const valAt = (line,yr) => {
  if(!line.length) return null;
  if(yr<=line[0][0]) return line[0][1];
  if(yr>=line[line.length-1][0]) return line[line.length-1][1];
  for(let i=1;i<line.length;i++){ const a=line[i-1],b=line[i];
    if(yr>=a[0]&&yr<=b[0]){ const t=(yr-a[0])/((b[0]-a[0])||1); return a[1]+t*(b[1]-a[1]); } }
  return null;
};

const out = {};
let n=0;
for(const f of readdirSync(DIR).filter(f=>f.endsWith(".json"))){
  const st = f.replace(".json","");
  let d; try { d = JSON.parse(readFileSync(join(DIR,f),"utf8")); } catch { continue; }
  let metric=null;
  for(const m of PREF){ const nd=d[m]; if(nd && nd[B.base] && (nd[B.dist]||nd[B.mort])){ metric=m; break; } }
  if(!metric) continue;
  const nd=d[metric];
  const base=medianByYear(nd[B.base]); if(!base.length) continue;
  const dist=medianByYear(nd[B.dist]); const mort=medianByYear(nd[B.mort]);
  const endYr=base[base.length-1][0], bEnd=base[base.length-1][1];
  const dEnd=dist.length?valAt(dist,endYr):null, mEnd=mort.length?valAt(mort,endYr):null;
  const distPct=(dEnd!=null&&bEnd)?(bEnd-dEnd)/bEnd*100:null;
  const mortPct=(mEnd!=null&&bEnd)?(bEnd-mEnd)/bEnd*100:null;
  const distPk=dist.length?Math.max(...dist.map(p=>p[1])):null;
  const distSource=(distPk!=null&&dEnd!=null&&distPk)?(distPk-dEnd)/distPk*100:null;
  out[st]={ metric, endYr,
    base:+bEnd.toFixed(1), dist:dEnd!=null?+dEnd.toFixed(1):null, mort:mEnd!=null?+mEnd.toFixed(1):null,
    distPct:distPct!=null?+distPct.toFixed(1):null, mortPct:mortPct!=null?+mortPct.toFixed(1):null,
    distSource:distSource!=null?+distSource.toFixed(1):null };
  n++;
}
writeFileSync("public/api/permanence_risk.json",
  JSON.stringify({ meta:{ generated:new Date().toISOString(),
    note:"Per-state reversal risk: cross-engine median reserve carbon, passive vs disturbance-exposed vs mortality-stressed. distPct = % shortfall of disturbance-exposed reserve vs passive reserve at horizon; distSource = peak-to-end drawdown of the disturbance-exposed reserve.",
    n_states:n }, states:out }, null, 1));
console.log("wrote public/api/permanence_risk.json for", n, "states");
