#!/usr/bin/env python3
"""ycx_inject_hybrid.py
Swap the dashboard's yc_fia_empirical_v1 AGC engine (peak-decline form) for the
FIA-plot hybrid + agedist/ceiling recalibration full series (fia_hybrid_fullseries_agc.csv).
Only metric agc_live_total is touched; all 12 scenario buckets get the FIA-plot
hybrid+recal [year, central, lo, hi] band. Other models in each bucket and all other
metrics are left untouched (biomass/volume/merch remain on the empirical-curve basis).
The decadal (11-pt) hybrid series is linearly interpolated onto the 5-yr (21-pt) grid
that sibling models use. US.json is re-summed from the 48 state series.
Usage: python3 ycx_inject_hybrid.py <api_dir> <fia_hybrid_fullseries_agc.csv>
"""
import csv, json, os, sys
api, csvp = sys.argv[1], sys.argv[2]
METRIC = "agc_live_total"; MODEL = "yc_fia_empirical_v1"; CLS = "YC"
LABEL = ("YC empirical yield curve (FIA plots, hybrid Chapman-Richards + decline form, "
         "recalibrated to FIA longitudinal increment + 95th-pct ceiling; raster fire/insect "
         "disturbance + GRM density mortality; owner-rotation harvest, FIA-anchored)")
BUCKETS = ["reserve (no harvest)","reserve (no harvest, disturbance-exposed)",
  "reserve (no harvest, mortality-stressed)","managed (harvest)",
  "managed (harvest, disturbance-exposed)","managed (harvest, mortality-stressed)",
  "managed (intensive)","managed (intensive, disturbance-exposed)",
  "managed (intensive, mortality-stressed)","managed (conservation)",
  "managed (conservation, disturbance-exposed)","managed (conservation, mortality-stressed)"]
YRS = list(range(2025,2126,5))                       # 21-pt 5-yr grid (match siblings)

def interp(xs, ys, X):
    out=[]
    for x in X:
        if x<=xs[0]: out.append(ys[0]); continue
        if x>=xs[-1]: out.append(ys[-1]); continue
        for i in range(1,len(xs)):
            if x<=xs[i]:
                t=(x-xs[i-1])/(xs[i]-xs[i-1]); out.append(ys[i-1]+t*(ys[i]-ys[i-1])); break
    return out

# load CSV -> data[state][bucket] = (years, value, lo, hi)
raw={}
for r in csv.DictReader(open(csvp)):
    st=r["state"]; bk=r["scenario"]; raw.setdefault(st,{}).setdefault(bk,[]).append(
        (int(r["year"]), float(r["value"]), float(r["lo"]), float(r["hi"])))
def series(st,bk,scale):
    rows=sorted(raw[st][bk]); xs=[a[0] for a in rows]
    v=interp(xs,[a[1] for a in rows],YRS); lo=interp(xs,[a[2] for a in rows],YRS); hi=interp(xs,[a[3] for a in rows],YRS)
    return [[YRS[i], round(scale*v[i],3), round(scale*min(v[i],lo[i],hi[i]),3), round(scale*max(v[i],lo[i],hi[i]),3)] for i in range(len(YRS))]

# anchor continuity: keep the established FIA t0 (2025), swap only the trajectory shape.
# per-state scale = existing yc_fia_empirical t0 / my raw t0 (reserve bucket), so the
# merge's per-metric K calibration is preserved and the line stays continuous at t0.
def t0_of(ser, models):
    res=(ser.get(METRIC) or {}).get("reserve (no harvest)",[])
    for mdl in models:
        for s in res:
            if s.get("model")==mdl and s.get("pts"):
                p0=sorted(s["pts"])[0]
                if p0[0]==YRS[0] and p0[1]>0: return p0[1]
    return None

SCALE={}
def inject(ser, st):
    ser.setdefault(METRIC,{})
    myr=sorted(raw[st]["reserve (no harvest)"]); my_t0=myr[0][1] if myr else 0
    tgt=t0_of(ser,[MODEL,"yc_treemap_spatial_v1","yc_hybrid_v1"])
    scale=(tgt/my_t0) if (tgt and my_t0>0) else 1.0
    SCALE[st]=scale
    for bk in BUCKETS:
        if st not in raw or bk not in raw[st]: continue
        node=ser[METRIC].setdefault(bk,[])
        node[:]=[s for s in node if s.get("model")!=MODEL]
        node.append({"model":MODEL,"cls":CLS,"label":LABEL,"pts":series(st,bk,scale)})

states=sorted(raw.keys()); n=0
for st in states:
    p=os.path.join(api,"series",f"{st}.json"); ser=json.load(open(p)) if os.path.exists(p) else {METRIC:{}}
    inject(ser,st); json.dump(ser,open(p,"w"),separators=(",",":")); open(p,"a").write("\n"); n+=1

# US.json: re-sum yc_fia_empirical_v1 across states per bucket per year
up=os.path.join(api,"series","US.json"); uj=json.load(open(up)) if os.path.exists(up) else {}
uj.setdefault(METRIC,{})
for bk in BUCKETS:
    agg={y:[0.0,0.0,0.0] for y in YRS}; have=False
    for st in states:
        if st not in raw or bk not in raw[st]: continue
        have=True
        for p in series(st,bk,SCALE.get(st,1.0)):
            a=agg[p[0]]; a[0]+=p[1]; a[1]+=p[2]; a[2]+=p[3]
    if not have: continue
    node=uj[METRIC].setdefault(bk,[]); node[:]=[s for s in node if s.get("model")!=MODEL]
    pts=[[y,round(agg[y][0],3),round(agg[y][1],3),round(agg[y][2],3)] for y in YRS]
    node.append({"model":MODEL,"cls":CLS,"label":LABEL+" — CONUS aggregate (sum of 48 states)","pts":pts})
json.dump(uj,open(up,"w"),separators=(",",":")); open(up,"a").write("\n")

# report CONUS reserve t0->t100
r=uj[METRIC]["reserve (no harvest)"]
fia=[s for s in r if s.get("model")==MODEL][0]["pts"]
print(f"injected {MODEL} into {n} states + US ({len(BUCKETS)} agc buckets each)")
print(f"CONUS reserve (no harvest): {fia[0][1]:.0f} -> {fia[-1][1]:.0f} Tg ({100*(fia[-1][1]/fia[0][1]-1):+.1f}%)")
