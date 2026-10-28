// Compact CONUS choropleth of reversal risk for the Permanence view.
// Self-contained Albers projection (mirrors SVGMap.jsx) so this view does not
// need to thread the full map component or load all-state series: it reads the
// precomputed public/api/permanence_risk.json summary.
// Fill is a neutral sequential ramp (ink opacity, 0 to 70+ % shortfall); the
// accent is reserved for the selected state outline, so the map stays in the
// house neutrals and the status colors appear only on the verdict mark.

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

// Sequential neutral ramp: 0% shortfall at 12% ink opacity, 70% and above at 88%.
const RISK_MAX=70;
const riskOpacity=v=>{ const t=Math.max(0,Math.min(RISK_MAX,v))/RISK_MAX; return 0.12+0.76*t; };

export default function PermanenceMap({ geo, risk, field="distPct", selected, onPick }){
  if(!geo || !geo.features || !risk) return null;
  const feats=geo.features.filter(ft=>ft.properties && ft.properties.state);
  const legendVals=[0,17.5,35,52.5,70];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}} role="img"
        aria-label="CONUS map of reversal risk: shortfall of the disturbance-exposed reserve below the passive reserve, percent">
        <rect x="0" y="0" width={W} height={H} rx={6} strokeWidth={1} style={{fill:"var(--panel-2)",stroke:"var(--line)"}}/>
        {feats.map(ft=>{
          const st=ft.properties.state, r=risk[st];
          const v=(r && r.reliable!==false)?r[field]:null;
          const notChar=!!(r && r.reliable===false);
          const isSel=st===selected;
          return <path key={st} d={geomToD(ft.geometry)}
            fillOpacity={v!=null?riskOpacity(v):(notChar?0.35:1)}
            strokeWidth={isSel?2.5:0.5}
            style={{fill:v!=null?"var(--ink)":(notChar?"var(--context)":"var(--nodata)"),
              stroke:isSel?"var(--accent)":"var(--map-edge)",cursor:r?"pointer":"default"}}
            onClick={()=>{ if(r && onPick) onPick(st); }}>
            <title>{`${st}${r?(notChar?`: sparse forest base, reversal not characterized`:`: disturbance-exposed reserve ${v!=null?v.toFixed(0)+"% below passive":"n/a"} at ${r.endYr}`):": no permanence data"}`}</title>
          </path>;
        })}
      </svg>
      {/* Legend as HTML under the map so it never covers states or shrinks on phones. */}
      <div className="pn-legend" aria-label="legend">
        <span className="eyebrow">Shortfall below passive (%)</span>
        <span className="pn-ramp">{legendVals.map((v,i)=>(<i key={i} style={{background:"var(--ink)",opacity:riskOpacity(v)}}/>))}</span>
        <span className="pn-ramp-lab">0, lower</span><span className="pn-ramp-lab">70 and above, higher</span>
        <span className="pn-ramp-lab"><i className="pn-sw" style={{background:"var(--context)",opacity:0.35}}/>not characterized</span>
        <span className="pn-ramp-lab"><i className="pn-sw" style={{background:"var(--nodata)"}}/>no permanence data</span>
      </div>
      <p className="pn-cap">
        Each state shaded by how far its disturbance-exposed no-harvest reserve falls below the passive reserve at horizon (cross-engine median); the stronger the fill, the larger the shortfall. The selected state is outlined in the accent. Click a state to load it. {Object.keys(risk).length} states.
      </p>
    </div>
  );
}
