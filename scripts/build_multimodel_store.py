#!/usr/bin/env python3
"""Assemble the served PERSEUS multi-model store from the harmonized Cardinal layer.

Produces two additive products in ~/perseus_run/ (does NOT modify the existing
per-acre series/*.json, so current tool behavior is unchanged until the front end wires
these in):

1. multimodel_state_summary.json  -- per state x scenario: each of the 6 models' 2100
   carbon (total/forest/HWP TgC) + NPV(3/5%), plus the cross-model ensemble (n, mean,
   median, min, max, between-model SD, 90% band). Source: harmonized_master_all_scenarios
   + harmonized_ensemble_by_scenario.

2. multimodel_anchored_trajectories.json -- per state x scenario: each engine's year-by-year
   AGC trajectory on the COMMON FIA-anchored basis (every engine shares the 2025 anchor, so
   spread = real model divergence). Source: the per-engine *_anchored.csv files + the
   harmonized LANDIS 9-state anchored file. Includes a per-year ensemble (mean/min/max/n).

Units: TgC (state totals), anchored to a shared 2025 FIA baseline. Reserve scenario where
anchored trajectories exist; the summary covers all 4 scenarios.
"""
import os, csv, json, collections, statistics as st

CM  = "/fs/scratch/PUOM0008/crsfaaron/conus_multimodel"
FIA = "/fs/scratch/PUOM0008/crsfaaron/FIA"
OUT = os.path.expanduser("~/perseus_run")

FIPS = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
"11":"DC","12":"FL","13":"GA","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY",
"22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT",
"31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH",
"40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT",
"50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"}
def usps(dom):
    s=str(dom).strip()
    if s in FIPS: return FIPS[s]
    if s.zfill(2) in FIPS: return FIPS[s.zfill(2)]
    return s.upper() if len(s)==2 else None

def rd(path):
    return list(csv.DictReader(open(path))) if os.path.exists(path) else []

# ---------- Product 1: state summary ----------
master = rd(f"{FIA}/harmonized_master_all_scenarios.csv")
summary = collections.defaultdict(lambda: collections.defaultdict(lambda: {"models":{}, "ensemble":{}}))
def num(x):
    try: return round(float(x),3)
    except: return None
for r in master:
    stt=r["state"]; scn=r["scenario"]; mdl=r["model"]; dm=r.get("dist_mode","")
    rec={"total_2100_TgC":num(r.get("total_2100_TgC")),"forest_2100_TgC":num(r.get("forest_2100_TgC")),
         "hwp_2100_TgC":num(r.get("hwp_2100_TgC")),"npv_0.03":num(r.get("npv_0.03")),"npv_0.05":num(r.get("npv_0.05"))}
    summary[stt][scn]["models"].setdefault(mdl,{})[dm or "default"]=rec

def band(vals):
    """Cross-model ensemble band, recomputed from the model values (fixes the
    lo90=0.0 floor carried in the harmonized source file). 90% band = mean +/-
    1.645*between-model SD, lo90 clipped at 0."""
    vals=[v for v in vals if v is not None]
    n=len(vals)
    if n==0: return None
    mean=sum(vals)/n
    sv=sorted(vals); med=sv[n//2] if n%2 else (sv[n//2-1]+sv[n//2])/2
    sd=(sum((v-mean)**2 for v in vals)/(n-1))**0.5 if n>1 else 0.0
    return {"n_models":n,"mean":round(mean,3),"median":round(med,3),"between_sd":round(sd,3),
            "min":round(min(vals),3),"max":round(max(vals),3),
            "lo90":round(max(mean-1.645*sd,0),3),"hi90":round(mean+1.645*sd,3)}
for stt in summary:
    for scn in summary[stt]:
        mods=summary[stt][scn]["models"]
        for dm in ["nodisturb","disturbed","default"]:
            vals=[mods[m][dm]["total_2100_TgC"] for m in mods
                  if dm in mods[m] and mods[m][dm].get("total_2100_TgC") is not None]
            if vals: summary[stt][scn]["ensemble"][dm]=band(vals)
json.dump(summary, open(f"{OUT}/multimodel_state_summary.json","w"), indent=1)
n_states=len(summary); n_scn=len({s for v in summary.values() for s in v})
print(f"state_summary: {n_states} states, scenarios={sorted({s for v in summary.values() for s in v})}")

# ---------- Product 2: anchored trajectories ----------
SRC = {
 "CBM":            (f"{CM}/cbm/cbm_reserve_anchored.csv",        "reserve"),
 "CBM_disturbed":  (f"{CM}/cbm/cbm_reserve_disturbed.csv",       "reserve_disturbed"),
 "CEM":            (f"{CM}/cem/cem_reserve_anchored.csv",        "reserve"),
 "CEM_disturbed":  (f"{CM}/cem/cem_reserve_disturbed.csv",       "reserve_disturbed"),
 "FVS_default":    (f"{CM}/fvs/fvs_reserve_default_anchored.csv","reserve"),
 "FVS_calibrated": (f"{CM}/fvs/fvs_reserve_calibrated_anchored.csv","reserve"),
 "FVS_gompit":     (f"{CM}/fvs/fvs_reserve_gompit_anchored.csv","reserve"),
 "YC":             (f"{CM}/yield_curves/yc_reserve_anchored.csv","reserve"),
 "LANDIS":         (f"{FIA}/harmonized_landis_reserve_9state.csv","reserve"),
}
traj = collections.defaultdict(lambda: collections.defaultdict(dict))   # state -> scenario -> model -> [[yr,val],...]
cover = collections.Counter()
for label,(path,scn) in SRC.items():
    rows=rd(path)
    if not rows: print("MISSING",label,path); continue
    model = "FVS" if label.startswith("FVS") else label.replace("_disturbed","")
    keyname = label  # keep default vs calibrated distinct, and disturbed variants
    by=collections.defaultdict(list)
    for r in rows:
        stt=usps(r.get("dom") or r.get("state"))
        if not stt: continue
        try: yr=int(float(r["year"])); v=round(float(r["agc_TgC_anchored"]),3)
        except: continue
        by[stt].append((yr,v))
    for stt,pts in by.items():
        pts=sorted(set(pts))
        traj[stt][scn][keyname]=[[y,v] for y,v in pts]
        cover[label]+=1
# per-year ensemble on the reserve scenario (models excluding disturbed variants)
for stt,scns in traj.items():
    for scn,models in list(scns.items()):
        if scn!="reserve": continue
        # Represent FVS in the ensemble by a SINGLE production member (engine decision:
        # b2_gompit). Prefer gompit, fall back to calibrated then default where gompit is
        # absent. This also fixes prior FVS double-counting (default + calibrated both averaged).
        fvs_pick = next((c for c in ("FVS_gompit","FVS_calibrated","FVS_default") if c in models), None)
        base={}
        for m,p in models.items():
            if m.endswith("_disturbed"): continue
            if m.startswith("FVS") and m!=fvs_pick: continue
            base[m]=dict(p)
        yrs=sorted({y for p in base.values() for y in p})
        ens=[]
        for y in yrs:
            vals=[p[y] for p in base.values() if y in p]
            if len(vals)>=2:
                mean=sum(vals)/len(vals)
                sd=(sum((v-mean)**2 for v in vals)/(len(vals)-1))**0.5
                ens.append([y, round(mean,3), round(min(vals),3), round(max(vals),3), len(vals),
                            round(sd,3), round(max(mean-1.645*sd,0),3), round(mean+1.645*sd,3)])
        if ens: traj[stt][scn]["_ensemble"]={"cols":["year","mean","min","max","n","sd","lo90","hi90"],"pts":ens}
json.dump(traj, open(f"{OUT}/multimodel_anchored_trajectories.json","w"), indent=1)
print("anchored trajectories: states=",len(traj))
print("per-source state coverage:", dict(cover))
# coverage report
rep={"state_summary_states":n_states,"summary_scenarios":sorted({s for v in summary.values() for s in v}),
     "trajectory_states":len(traj),"trajectory_source_coverage":dict(cover),
     "landis_trajectory_states":sorted([s for s in traj if "LANDIS" in traj[s].get("reserve",{})])}
json.dump(rep, open(f"{OUT}/multimodel_build_report.json","w"), indent=1)
print(json.dumps(rep,indent=1))
print("DONE")
