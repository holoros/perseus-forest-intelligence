#!/usr/bin/env python3
"""
ycx_merge_perseus.py  (v3 — adds merch biomass + merch/total volume)

Inject the empirical yield-curve engine (cls "YC") into PERSEUS api/series
for every state with a ycx_<ST>_state_series.csv.

Stock metrics & native densities (from ycx_02):
  agc_live_total  Mg C/ha  -> Tg C   (FIA-anchored via A0)
  agb_dry         Mg/ha    -> Tg     (physical, area model)
  merch_bio_dry   Mg/ha    -> Tg     (physical; NEW metric, DRYBIO_BOLE)
  vol_stem        m3/ha    -> Mm3    (total stem gross, VOLTSGRS; unit-calibrated)
  merch_vol_mcf   cuft/ac  -> Mcf    (net merch, VOLCFNET; unit-calibrated)
Flux: harvest_c_yr (Tg C/yr, managed bucket).

State totals use the uniform-grid area model area_ha = n_plots * A0, with A0
calibrated so AG-carbon totals reproduce fia.json tg_agc (median A0 for the
rest). vol_stem and merch_vol_mcf carry idiosyncratic upstream units, so a
single global factor K_metric scales the physical YC total onto the existing
engines' axis (median of existing_2025 / YC_physical_2025 across states that
already have that metric). Carbon/biomass stay in physical units.

Usage: python3 ycx_merge_perseus.py <repo_dir> <series_csv_dir>
"""
import csv, json, sys, os, glob, statistics
from collections import defaultdict

repo, csvdir = sys.argv[1], sys.argv[2]
api  = os.path.join(repo, "public", "api")
fia  = json.load(open(os.path.join(api, "fia.json")))
META = json.load(open(os.path.join(api, "meta.json")))
stmeta = json.load(open(os.path.join(api, "states.json")))

MODEL, CLS, START = "yc_fia_empirical_v1", "YC", 2025
AC_PER_HA = 2.4710538
BUCKETS = ["reserve (no harvest)", "managed (harvest)"]
# metric -> ("tg"|"mm3"|"mcf"), calibrate_to_existing?
MET = {
 "agc_live_total": ("tg",  False),
 "agb_dry":        ("tg",  False),
 "merch_bio_dry":  ("tg",  False),
 "vol_stem":       ("mm3", True),
 "merch_vol_mcf":  ("mcf", True),
}
ST_INFO = {
 "AL":("Alabama",[-86.8,32.8]),"AZ":("Arizona",[-111.7,34.3]),"AR":("Arkansas",[-92.4,34.8]),
 "CA":("California",[-119.7,37.2]),"CO":("Colorado",[-105.5,39.0]),"CT":("Connecticut",[-72.7,41.6]),
 "DE":("Delaware",[-75.5,39.0]),"FL":("Florida",[-81.7,28.6]),"GA":("Georgia",[-83.4,32.6]),
 "ID":("Idaho",[-114.5,44.4]),"IL":("Illinois",[-89.2,40.0]),"IN":("Indiana",[-86.3,39.9]),
 "IA":("Iowa",[-93.5,42.0]),"KS":("Kansas",[-98.3,38.5]),"KY":("Kentucky",[-85.3,37.5]),
 "LA":("Louisiana",[-92.0,31.0]),"ME":("Maine",[-69.2,45.4]),"MD":("Maryland",[-76.8,39.0]),
 "MA":("Massachusetts",[-71.8,42.3]),"MI":("Michigan",[-85.0,44.3]),"MN":("Minnesota",[-94.3,46.3]),
 "MS":("Mississippi",[-89.7,32.7]),"MO":("Missouri",[-92.5,38.4]),"MT":("Montana",[-109.6,47.0]),
 "NE":("Nebraska",[-99.8,41.5]),"NV":("Nevada",[-116.9,39.3]),"NH":("New Hampshire",[-71.6,43.7]),
 "NJ":("New Jersey",[-74.7,40.1]),"NM":("New Mexico",[-106.1,34.4]),"NY":("New York",[-75.5,42.9]),
 "NC":("North Carolina",[-79.4,35.5]),"ND":("North Dakota",[-100.5,47.4]),"OH":("Ohio",[-82.8,40.3]),
 "OK":("Oklahoma",[-97.5,35.6]),"OR":("Oregon",[-120.6,43.9]),"PA":("Pennsylvania",[-77.8,41.0]),
 "RI":("Rhode Island",[-71.5,41.7]),"SC":("South Carolina",[-80.9,33.9]),"SD":("South Dakota",[-100.2,44.4]),
 "TN":("Tennessee",[-86.4,35.8]),"TX":("Texas",[-99.3,31.5]),"UT":("Utah",[-111.7,39.3]),
 "VT":("Vermont",[-72.7,44.0]),"VA":("Virginia",[-78.8,37.5]),"WA":("Washington",[-120.4,47.4]),
 "WV":("West Virginia",[-80.6,38.9]),"WI":("Wisconsin",[-89.9,44.6]),"WY":("Wyoming",[-107.5,43.0]),
}

def load_native(path):
    d = defaultdict(lambda: defaultdict(dict)); npl = 0
    for r in csv.DictReader(open(path)):
        d[r["metric"]][r["mgmt"]][int(r["year"])] = (
            float(r["value"]), float(r["value_lo"]), float(r["value_hi"]))
        npl = max(npl, int(r["n_plots"]))
    return d, npl

def load_flux(path):
    out = {}
    if os.path.exists(path):
        for r in csv.DictReader(open(path)):
            out[int(r["year"])] = float(r["removed_density_per_yr"])
    return out

files = sorted(glob.glob(os.path.join(csvdir, "ycx_*_state_series.csv")))
native, nplots, hflux = {}, {}, {}
for f in files:
    st = os.path.basename(f).split("_")[1]
    native[st], nplots[st] = load_native(f)
    hflux[st] = load_flux(os.path.join(csvdir, f"ycx_{st}_harvest_flux.csv"))

# ---- A0 (ha/plot) from FIA carbon anchors ----
A0 = {}
for st in native:
    tg = fia.get(st, {}).get("tg_agc")
    if tg is None: continue
    d25 = native[st]["agc_live_total"]["reserve (no harvest)"][START][0]
    if d25 > 0 and nplots[st] > 0:
        A0[st] = tg * 1e6 / (d25 * nplots[st])
A0_med = statistics.median(A0.values())
def area_ha(st): return nplots[st] * A0.get(st, A0_med)
print(f"A0: {len(A0)} anchored states, median {A0_med:.0f} ha/plot")

def phys_total(metric, density, st):
    kind = MET[metric][0]
    if kind in ("tg","mm3"):           # Mg/ha->Tg or m3/ha->Mm3
        return density * area_ha(st) / 1e6
    if kind == "mcf":                  # cuft/ac -> cuft total /1e6
        return density * (area_ha(st)*AC_PER_HA) / 1e6
    return density

def existing_at_2025(node):
    """median over non-YC engines of value interpolated to START."""
    vals=[]
    for s in node:
        if s.get("cls")=="YC": continue
        pts=sorted(s["pts"]);
        if not pts: continue
        xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
        if START<=xs[0]: v=ys[0]
        elif START>=xs[-1]: v=ys[-1]
        else:
            for i in range(1,len(xs)):
                if xs[i]>=START:
                    t=(START-xs[i-1])/(xs[i]-xs[i-1]); v=ys[i-1]+t*(ys[i]-ys[i-1]); break
        vals.append(v)
    return statistics.median(vals) if vals else None

# ---- calibration factor K for unit-ambiguous metrics ----
K = {m:1.0 for m in MET}
for metric,(kind,cal) in MET.items():
    if not cal: continue
    ratios=[]
    for st in native:
        if metric not in native[st]: continue
        spath=os.path.join(api,"series",f"{st}.json")
        if not os.path.exists(spath): continue
        ex=json.load(open(spath)).get(metric,{}).get("managed (harvest)",[])
        ev=existing_at_2025(ex)
        if ev is None: continue
        d25=native[st][metric]["reserve (no harvest)"][START][0]
        phys=phys_total(metric,d25,st)
        if phys>0: ratios.append(ev/phys)
    if ratios: K[metric]=statistics.median(ratios)
    print(f"K[{metric}] = {K[metric]:.4g}  (from {len(ratios)} existing-engine states)")

# ---- inject ----
added_states=[]; yc_globally_new=True
for st in sorted(native):
    spath=os.path.join(api,"series",f"{st}.json")
    ser=json.load(open(spath)) if os.path.exists(spath) else {}
    had_yc=any(s.get("model")==MODEL for mt in ser for bk in ser[mt] for s in ser[mt][bk])
    if had_yc: yc_globally_new=False
    added=0; metrics_here=[]
    for metric in MET:
        if metric not in native[st]: continue
        metrics_here.append(metric)
        for bucket in BUCKETS:
            nb=native[st][metric][bucket]; pts=[]
            for y in sorted(nb):
                v,lo,hi=nb[y]
                f=K[metric]
                pts.append([y, round(phys_total(metric,v,st)*f,3),
                               round(phys_total(metric,lo,st)*f,3),
                               round(phys_total(metric,hi,st)*f,3)])
            node=ser.setdefault(metric,{}).setdefault(bucket,[])
            node[:]=[s for s in node if s.get("model")!=MODEL]
            node.append({"model":MODEL,"cls":CLS,
                "label":("YC empirical yield curve (FIA chronosequence, EPA-L3 x "
                         "ownership strata; owner-rotation harvest, FIA-anchored)"),
                "pts":pts})
            added+=len(pts)
    # harvest flux
    if hflux.get(st):
        fl=hflux[st]; A=area_ha(st)
        pts=[[y, round(fl[y]*A/1e6,4)] for y in sorted(fl)]
        node=ser.setdefault("harvest_c_yr",{}).setdefault("managed (harvest)",[])
        node[:]=[s for s in node if s.get("model")!=MODEL]
        node.append({"model":MODEL,"cls":CLS,
            "label":"YC harvest carbon flux (owner-rotation removals)","pts":pts})
        added+=len(pts); metrics_here.append("harvest_c_yr")
    json.dump(ser, open(spath,"w"), separators=(",",":"))

    sm=stmeta.get(st)
    if sm:
        sm["series_metrics"]=sorted(set(sm.get("series_metrics",[]))|set(metrics_here))
        sm["has_series"]=True
        if not had_yc:                  # first time YC added -> count it once
            sm["engines"]=sm.get("engines",0)+1
            sm["rows"]=sm.get("rows",0)+added
    else:
        name,cen=ST_INFO.get(st,(st,[-98.0,39.0]))
        stmeta[st]={"engines":1,"metrics":len(metrics_here),"rows":added,
                    "name":name,"centroid":cen,"has_series":True,
                    "has_tier_b":False,"series_metrics":sorted(metrics_here)}
        added_states.append(st)

# register new metric in meta
META.setdefault("metrics",{})["merch_bio_dry"]={
    "label":"Merchantable bole dry biomass","unit":"Tg dry biomass",
    "kind":"stock","group":"carbon"}
json.dump(stmeta, open(os.path.join(api,"states.json"),"w"), indent=1, ensure_ascii=False)
open(os.path.join(api,"states.json"),"a").write("\n")
# meta engines already counts YC (added in the first merge); refresh state count
# and bump engines only if YC was globally new this run (no state had it before).
META["stats"]["states"]=len([k for k in stmeta if k!="US"])
if yc_globally_new:
    META["stats"]["engines"]=META["stats"].get("engines",0)+1
json.dump(META, open(os.path.join(api,"meta.json"),"w"), indent=1, ensure_ascii=False)
open(os.path.join(api,"meta.json"),"a").write("\n")

print(f"Injected YC into {len(native)} states ({len(added_states)} new).")
for st in ["ME","GA","CA","TX","OR"]:
    if st not in native: continue
    line=[]
    for metric in MET:
        if metric not in native[st]: continue
        r=native[st][metric]["reserve (no harvest)"]
        line.append(f"{metric.split('_')[0]}:{round(phys_total(metric,r[2025][0],st)*K[metric],1)}->"
                    f"{round(phys_total(metric,r[2075][0],st)*K[metric],1)}")
    print(f"  {st} (reserve 2025->2075): " + "  ".join(line))
