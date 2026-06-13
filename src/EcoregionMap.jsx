// Compact CONUS choropleth of an ecoregion-summary field (EPA L3 polygons).
// Self-contained Albers projection (mirrors SVGMap/PermanenceMap) so the
// ecoregion tab can show its summary spatially without the full map stack.
const W=640,H=400,PAD=8;
const PHI0=37.5*Math.PI/180,PHI1=29.5*Math.PI/180,PHI2=45.5*Math.PI/180,LAM0=-96*Math.PI/180;
const N=(Math.sin(PHI1)+Math.sin(PHI2))/2, C=Math.cos(PHI1)**2+2*N*Math.sin(PHI1), RHO0=Math.sqrt(C-2*N*Math.sin(PHI0))/N;
function project(lon,lat){ const phi=lat*Math.PI/180,lam=lon*Math.PI/180;
  const rho=Math.sqrt(Math.max(0,C-2*N*Math.sin(phi)))/N, theta=N*(lam-LAM0);
  return [rho*Math.sin(theta), RHO0-rho*Math.cos(theta)]; }
const _c=[[-125,50],[-66,50],[-125,24],[-66,24],[-95,49],[-95,25]].map(p=>project(...p));
const _xs=_c.map(c=>c[0]),_ys=_c.map(c=>c[1]);
const _x0=Math.min(..._xs),_x1=Math.max(..._xs),_y0=Math.min(..._ys),_y1=Math.max(..._ys),_dx=_x1-_x0,_dy=_y1-_y0;
const SCALE=Math.min((W-2*PAD)/_dx,(H-2*PAD)/_dy), TX=-_x0*SCALE+(W-_dx*SCALE)/2, TY=PAD+SCALE*_y1+(H-2*PAD-_dy*SCALE)/2;
const projPath=(lon,lat)=>{ const [x,y]=project(lon,lat); return [x*SCALE+TX,-y*SCALE+TY]; };
const ringToD=r=>{ let d=""; for(let i=0;i<r.length;i++){ const [x,y]=projPath(r[i][0],r[i][1]); d+=(i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1);} return d+"Z"; };
const geomToD=g=>{ if(!g) return ""; const polys=g.type==="Polygon"?[g.coordinates]:g.coordinates; return polys.map(p=>p.map(ringToD).join(" ")).join(" "); };
// sequential blue->amber->red, value normalized 0..1
const STOPS=[[0,[47,98,158]],[0.5,[202,161,90]],[1,[224,90,90]]];
const ramp=t=>{ if(t==null||isNaN(t)) return "#2a3a47"; t=Math.max(0,Math.min(1,t));
  let a=STOPS[0],b=STOPS[STOPS.length-1];
  for(let i=1;i<STOPS.length;i++){ if(t<=STOPS[i][0]){ a=STOPS[i-1]; b=STOPS[i]; break; } }
  const f=(t-a[0])/((b[0]-a[0])||1); const c=a[1].map((ca,k)=>Math.round(ca+f*(b[1][k]-ca)));
  return "#"+c.map(x=>x.toString(16).padStart(2,"0")).join(""); };

export default function EcoregionMap({ geo, eco, field, label, fmt }){
  if(!geo || !geo.features || !eco) return <div style={{color:"var(--mut)",fontSize:11,padding:"6px 0"}}>Loading ecoregion map…</div>;
  const feats=geo.features.filter(ft=>ft.properties && ft.properties.NA_L3CODE);
  const vals=Object.values(eco).map(v=>v[field]).filter(v=>v!=null&&isFinite(v));
  const lo=Math.min(...vals), hi=Math.max(...vals), span=(hi-lo)||1;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        <rect width={W} height={H} fill="#101820"/>
        {feats.map((ft,i)=>{
          const code=ft.properties.NA_L3CODE; const r=eco[code]; const v=r?r[field]:null;
          const t=(v!=null&&isFinite(v))?(v-lo)/span:null;
          return <path key={code+i} d={geomToD(ft.geometry)} fill={ramp(t)} fillOpacity={v!=null?0.92:0.18}
            stroke="#0b1015" strokeWidth="0.3">
            <title>{`${r?r.name:code}${v!=null?` · ${label}: ${fmt?fmt(v):v}`:" · no data"}`}</title>
          </path>;
        })}
        <g transform={`translate(${W-150},${H-30})`}>
          {[0,0.25,0.5,0.75,1].map((t,i)=>(<rect key={i} x={i*26} y={0} width={26} height={9} fill={ramp(t)}/>))}
          <text x={0} y={22} fill="#8aa0b0" fontSize="9">{fmt?fmt(lo):lo.toFixed(1)}</text>
          <text x={130} y={22} textAnchor="end" fill="#8aa0b0" fontSize="9">{fmt?fmt(hi):hi.toFixed(1)}</text>
        </g>
        <text x={12} y={20} fill="#cddbe4" fontSize="13" fontWeight="bold">{label} by ecoregion</text>
      </svg>
    </div>
  );
}
