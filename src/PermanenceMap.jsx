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
const rampRisk=v=>{ if(v==null||isNaN(v)) return "#2a3a47";
  v=Math.max(0,Math.min(70,v));
  let a=STOPS[0],b=STOPS[STOPS.length-1];
  for(let i=1;i<STOPS.length;i++){ if(v<=STOPS[i][0]){ a=STOPS[i-1]; b=STOPS[i]; break; } }
  const t=(v-a[0])/((b[0]-a[0])||1);
  const c=a[1].map((ca,k)=>Math.round(ca+t*(b[1][k]-ca)));
  return "#"+c.map(x=>x.toString(16).padStart(2,"0")).join(""); };

export default function PermanenceMap({ geo, risk, field="distPct", selected, onPick }){
  if(!geo || !geo.features || !risk) return null;
  const feats=geo.features.filter(ft=>ft.properties && ft.properties.state);
  const legendVals=[0,20,40,55,70];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        <rect x="0" y="0" width={W} height={H} fill="#101820"/>
        {feats.map(ft=>{
          const st=ft.properties.state, r=risk[st];
          const v=r?r[field]:null;
          const fill=rampRisk(v);
          const isSel=st===selected;
          return <path key={st} d={geomToD(ft.geometry)} fill={fill}
            fillOpacity={v!=null?0.92:0.3}
            stroke={isSel?"#fff":"#0b1015"} strokeWidth={isSel?2:0.5}
            style={{cursor:r?"pointer":"default"}}
            onClick={()=>{ if(r && onPick) onPick(st); }}>
            <title>{`${st}${r?` · disturbance-exposed reserve ${v!=null?v.toFixed(0)+"% below passive":"—"} at ${r.endYr}`:" · no permanence data"}`}</title>
          </path>;
        })}
        {/* legend */}
        <g transform={`translate(${W-150},${H-30})`}>
          {legendVals.map((v,i)=>(<rect key={i} x={i*26} y={0} width={26} height={9} fill={rampRisk(v)}/>))}
          <text x={0} y={22} fill="#8aa0b0" fontSize="9">lower</text>
          <text x={legendVals.length*26} y={22} textAnchor="end" fill="#8aa0b0" fontSize="9">higher reversal risk</text>
        </g>
      </svg>
      <div style={{color:"var(--mut)",fontSize:10.5,marginTop:2}}>
        Each state shaded by how far its disturbance-exposed no-harvest reserve falls below the passive reserve at horizon (cross-engine median). Click a state to load it. {Object.keys(risk).length} states.
      </div>
    </div>
  );
}
