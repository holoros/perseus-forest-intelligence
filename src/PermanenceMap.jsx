// Compact CONUS choropleth of reversal risk for the Permanence view.
// Self-contained Albers projection (mirrors SVGMap.jsx) so this view does not
// need to thread the full map component or load all-state series — it reads the
// precomputed public/api/permanence_risk.json summary.
const W=640, H=400, PAD=8;
const PHI0=37.5*Math.PI/180, PHI1=29.5*Math.PI/180, PHI2=45.5*Math.PI/180, LAM0=-96*Math.PI/180;
const N=(Math.sin(PHI1)+Math.sin(PHI2))/2;
const C=Math.cos(PHI1)**2+2*N*Math.sin(PHI1);
const RHO0=Math.sqrt(C-2*N*Math.sin(PHI0))/N;
function project(lon,lat){ const phi=lat*Math.PI/180, lam=lon*Math.PI/180;
  const rho=Math.sqrt(Math.max(0,C-2*N*Math.sin(phi)))/N, theta=N*(lam-LAM0);
  return [rho*Math.sin(theta), RHO0-rho*Math.cos(theta)]; }
const _c=[project(-125,50),project(-66,50),project(-125,24),project(-66,24),project(-95,49),project(-95,25)];
const _xs=_c.map(c=>c[0]), _ys=_c.map(c=>c[1]);
const _x0=Math.min(..._xs),_x1=Math.max(..._xs),_y0=Math.min(..._ys),_y1=Math.max(..._ys);
const _dx=_x1-_x0,_dy=_y1-_y0, SCALE=Math.min((W-2*PAD)/_dx,(H-2*PAD)/_dy);
const TX=-_x0*SCALE+(W-_dx*SCALE)/2, TY=PAD+SCALE*_y1+(H-2*PAD-_dy*SCALE)/2;
const projPath=(lon,lat)=>{ const [x,y]=project(lon,lat); return [x*SCALE+TX,-y*SCALE+TY]; };
const ringToD=r=>{ let d=""; for(let i=0;i<r.length;i++){ const [x,y]=projPath(r[i][0],r[i][1]); d+=(i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1);} return d+"Z"; };
const geomToD=g=>{ if(!g) return ""; const polys=g.type==="Polygon"?[g.coordinates]:g.coordinates; return polys.map(p=>p.map(ringToD).join(" ")).join(" "); };

// sequential risk ramp: low (green) -> moderate (amber) -> high (red)
const STOPS=[[0,[47,158,106]],[40,[202,161,90]],[70,[224,90,90]]];
const rampRisk=v=>{ if(v==null||isNaN(v)) return "var(--nodata, #2a3a47)";
  v=Math.max(0,Math.min(70,v));
  let a=STOPS[0],b=STOPS[STOPS.length-1];
  for(let i=1;i<STOPS.length;i++){ if(v<=STOPS[i][0]){ a=STOPS[i-1]; b=STOPS[i]; break; } }
  const t=(v-a[0])/((b[0]-a[0])||1);
  const c=a[1].map((ca,k)=>Math.round(ca+t*(b[1][k]-ca)));
  return "#"+c.map(x=>x.toString(16).padStart(2,"0")).join(""); };

// sparse-base states flagged unreliable: a neutral context gray, distinct from no data
const NOTCHAR="var(--context, #3a4654)";

export default function PermanenceMap({ geo, risk, field="distPct", selected, onPick }){
  if(!geo || !geo.features || !risk) return null;
  const feats=geo.features.filter(ft=>ft.properties && ft.properties.state);
  const legendVals=[0,20,40,55,70];
  const axisTxt={fill:"var(--axis, #8aa0b0)",fontVariantNumeric:"tabular-nums"};
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        <rect x="0" y="0" width={W} height={H} rx={6} strokeWidth={1} style={{fill:"var(--panel-2, #101820)",stroke:"var(--line)"}}/>
        {feats.map(ft=>{
          const st=ft.properties.state, r=risk[st];
          const v=(r && r.reliable!==false)?r[field]:null;
          const fill=(r && r.reliable===false)?NOTCHAR:rampRisk(v);
          const isSel=st===selected;
          return <path key={st} d={geomToD(ft.geometry)}
            fillOpacity={v!=null?0.92:0.3}
            strokeWidth={isSel?2:0.5}
            style={{fill,stroke:isSel?"var(--map-sel, #fff)":"var(--map-edge, #0b1015)",cursor:r?"pointer":"default"}}
            onClick={()=>{ if(r && onPick) onPick(st); }}>
            <title>{`${st}${r?(r.reliable===false?` · sparse forest base, reversal not characterized`:` · disturbance-exposed reserve ${v!=null?v.toFixed(0)+"% below passive":"n/a"} at ${r.endYr}`):" · no permanence data"}`}</title>
          </path>;
        })}
        {/* legend */}
        <g transform={`translate(${W-150},${H-44})`}>
          <text x={legendVals.length*26} y={-4} textAnchor="end" fontSize="10" style={{fill:"var(--ink-2, #cddbe4)"}}>Shortfall below passive (%)</text>
          {legendVals.map((v,i)=>(<rect key={i} x={i*26} y={0} width={26} height={9} style={{fill:rampRisk(v)}}/>))}
          <text x={0} y={21} fontSize="10" style={axisTxt}>0, lower</text>
          <text x={legendVals.length*26} y={21} textAnchor="end" fontSize="10" style={axisTxt}>70+, higher</text>
          <rect x={0} y={28} width={10} height={9} fillOpacity={0.3} style={{fill:NOTCHAR}}/>
          <text x={14} y={36} fontSize="10" style={axisTxt}>not characterized</text>
        </g>
      </svg>
      <div style={{color:"var(--mut)",fontSize:11,marginTop:4,lineHeight:1.5}}>
        Each state shaded by how far its disturbance-exposed no-harvest reserve falls below the passive reserve at horizon (cross-engine median). Click a state to load it. {Object.keys(risk).length} states.
      </div>
    </div>
  );
}
