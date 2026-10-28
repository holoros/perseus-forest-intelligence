// Compact CONUS choropleth of an ecoregion-summary field (EPA L3 polygons).
// Self-contained Albers projection (mirrors SVGMap/PermanenceMap) so the
// ecoregion tab can show its summary spatially without the full map stack.
// Fill is a single-hue sequential ramp on the accent token (opacity encodes the
// normalized value), so it follows the theme without any literal color.
import useWidth from "./useWidth.js";

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
// Sequential single-hue ramp: accent at 15% (low) to 100% (high) opacity over the panel.
export const seqOpacity=t=>0.15+0.85*Math.max(0,Math.min(1,t));

export default function EcoregionMap({ geo, eco, field, label, fmt }){
  const [setBox, bw] = useWidth(640, 240, 720);
  if(!geo || !geo.features || !eco) return <div className="pn-cap">Loading ecoregion map</div>;
  const feats=geo.features.filter(ft=>ft.properties && ft.properties.NA_L3CODE);
  const vals=Object.values(eco).map(v=>v[field]).filter(v=>v!=null&&isFinite(v));
  const lo=Math.min(...vals), hi=Math.max(...vals), span=(hi-lo)||1;
  // Chrome (title, legend) scales up when the map renders narrower than its viewBox,
  // so on-screen text never drops below its designed size.
  const k=Math.max(1, W/bw);
  return (
    <div ref={setBox}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}} role="img"
        aria-label={`${label} by EPA Level III ecoregion, CONUS choropleth`}>
        <rect width={W} height={H} rx={6} style={{fill:"var(--panel-2)",stroke:"var(--line)"}} strokeWidth={1}/>
        {feats.map((ft,i)=>{
          const code=ft.properties.NA_L3CODE; const r=eco[code]; const v=r?r[field]:null;
          const t=(v!=null&&isFinite(v))?(v-lo)/span:null;
          return <path key={code+i} d={geomToD(ft.geometry)}
            fillOpacity={t!=null?seqOpacity(t):1}
            strokeWidth="0.3" style={{fill:t!=null?"var(--accent)":"var(--nodata)",stroke:"var(--map-edge)"}}>
            <title>{`${r?r.name:code}${v!=null?`: ${label} ${fmt?fmt(v):v}`:": no data"}`}</title>
          </path>;
        })}
        <g transform={`translate(12,${8+12*k}) scale(${k})`}>
          <text x={0} y={0} className="ch-ttl">{label} by ecoregion</text>
        </g>
      </svg>
      <div className="pn-legend" aria-label="legend">
        <span className="eyebrow">{label}</span>
        <span className="pn-ramp">{[0,0.25,0.5,0.75,1].map((t,i)=>(<i key={i} style={{background:"var(--accent)",opacity:seqOpacity(t)}}/>))}</span>
        <span className="pn-ramp-lab">{fmt?fmt(lo):lo.toFixed(1)}, low</span><span className="pn-ramp-lab">{fmt?fmt(hi):hi.toFixed(1)}, high</span>
        <span className="pn-ramp-lab"><i className="pn-sw" style={{background:"var(--nodata)"}}/>no forest summary</span>
      </div>
    </div>
  );
}
