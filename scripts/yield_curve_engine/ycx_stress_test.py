#!/usr/bin/env python3
"""ycx_stress_test.py  -- comprehensive validation of the CONUS YC canonical
CI outputs (FIADB + TreeMap, rcp45/rcp85) and the staging perseus_db ingest.
Usage: python3 ycx_stress_test.py <canonical_dir> <fia_anchor_csv> <staging_db>"""
import csv, glob, os, sys, sqlite3, math
CAN, ANCHOR, DB = sys.argv[1], sys.argv[2], sys.argv[3]
SCEN_ORDER=["No_harvest","Harvest_m25_mill","BAU","Harvest_p25_pulp","Harvest_p50_biomass"]  # decreasing standing carbon
YCM=["mmt_agc","mmt_biomass","total_vol_mcf","merch_vol_mcf","total_area_mha"]
NA_POOLS=["mmt_bgc","mmt_dead_c","mmt_litter_c","mmt_soil_c","mmt_under_c","mmt_total_c","rd_mean_wtd","sdi_mean_wtd"]
fails=[]; warns=[]
def fail(m): fails.append(m)
def warn(m): warns.append(m)

anchor={r["state"]:float(r["tg_agc"]) for r in csv.DictReader(open(ANCHOR))}
def load(f):
    rows=list(csv.DictReader(open(f))); return rows

# ---- 1. file coverage ----
states=sorted({os.path.basename(f).split("_")[3] for f in glob.glob(CAN+"/ci_yc_fiadb_*_rcp45.csv")})
print("states:",len(states))
exp=0
for exp_set in ("fiadb","treemap"):
    for rcp in ("rcp45","rcp85"):
        for st in states:
            f=f"{CAN}/ci_yc_{exp_set}_{st}_{rcp}.csv"
            if not os.path.exists(f): fail(f"missing {os.path.basename(f)}"); continue
            exp+=1
print("files present:",exp,"/",len(states)*4)

# ---- 2-7. per-file checks ----
conus_fiadb_t0={"rcp45":0,"rcp85":0}; conus_tm_t0={"rcp45":0,"rcp85":0}
conus_t100={("fiadb","rcp45"):0,("treemap","rcp45"):0}
ratio_examples={}
for exp_set in ("fiadb","treemap"):
    for rcp in ("rcp45","rcp85"):
        for st in states:
            f=f"{CAN}/ci_yc_{exp_set}_{st}_{rcp}.csv"
            if not os.path.exists(f): continue
            rows=load(f)
            if len(rows)!=105: fail(f"{os.path.basename(f)} rows={len(rows)} (exp 105)")
            scn=set(r["scenario"] for r in rows)
            if scn!=set(SCEN_ORDER): fail(f"{os.path.basename(f)} scenarios={scn}")
            yrs=sorted(set(int(r["year"]) for r in rows))
            if yrs[0]!=2025 or yrs[-1]!=2125: fail(f"{os.path.basename(f)} year range {yrs[0]}..{yrs[-1]}")
            # value sanity + CI ordering + NA pools
            for r in rows:
                for m in YCM:
                    mean=r.get(m+"_mean");
                    if mean in (None,"","NA"): fail(f"{os.path.basename(f)} {m} blank"); continue
                    mean=float(mean); lo=float(r[m+"_lo"]); hi=float(r[m+"_hi"])
                    if not math.isfinite(mean) or mean<0: fail(f"{os.path.basename(f)} {m} bad val {mean}")
                    if not (lo<=mean<=hi): fail(f"{os.path.basename(f)} {m} CI not ordered {lo}/{mean}/{hi}")
                for m in NA_POOLS:
                    if r.get(m+"_mean","NA") not in ("NA","","NA "): warn(f"{os.path.basename(f)} {m} not NA")
            # scenario ordering (agc 2125 monotonic decreasing in harvest_Q)
            a={r["scenario"]:float(r["mmt_agc_mean"]) for r in rows if int(r["year"])==2125}
            seq=[a[s] for s in SCEN_ORDER]
            if any(seq[i]<seq[i+1]-1e-6 for i in range(len(seq)-1)):
                fail(f"{os.path.basename(f)} agc 2125 not monotonic by harvest_Q: {[round(x,1) for x in seq]}")
            # t0 accumulation
            t0=next(float(r["mmt_agc_mean"]) for r in rows if r["scenario"]=="No_harvest" and int(r["year"])==2025)
            t100=next(float(r["mmt_agc_mean"]) for r in rows if r["scenario"]=="No_harvest" and int(r["year"])==2125)
            if exp_set=="fiadb": conus_fiadb_t0[rcp]+=t0
            else: conus_tm_t0[rcp]+=t0
            if (exp_set,rcp)==("fiadb","rcp45") or (exp_set,rcp)==("treemap","rcp45"): conus_t100[(exp_set,rcp)]+=t100
            # FIADB t0 anchor check (rcp arms ~ equal at t0 since pm(2025)~1)
            if exp_set=="fiadb" and rcp=="rcp45" and st.upper() in anchor:
                if abs(t0-anchor[st.upper()])>0.5: fail(f"FIADB {st} t0 {t0:.1f} != fia.json {anchor[st.upper()]:.1f}")
            if st=="me": ratio_examples[(exp_set,rcp)]=(round(t0,1),round(t100,1))

print("\n-- CONUS reserve AGC 2025 (t0) --")
print(f"  FIADB rcp45={conus_fiadb_t0['rcp45']:.0f}  rcp85={conus_fiadb_t0['rcp85']:.0f} Tg")
print(f"  TreeMap rcp45={conus_tm_t0['rcp45']:.0f}  rcp85={conus_tm_t0['rcp85']:.0f} Tg  (TreeMap should ~10002)")
print(f"  CONUS reserve AGC 2125: FIADB={conus_t100[('fiadb','rcp45')]:.0f}  TreeMap={conus_t100[('treemap','rcp45')]:.0f} Tg")
print("  ME (t0,t100):", ratio_examples)

# ---- 8. staging DB checks ----
print("\n-- staging perseus_db --")
c=sqlite3.connect(DB)
for mc in ("yc_fiadb_rcp45","yc_fiadb_rcp85","yc_treemap_rcp45","yc_treemap_rcp85"):
    n,st,sc,me,y0,y1=list(c.execute("select count(*),count(distinct state_code),count(distinct scenario_preset_id),count(distinct metric_code),min(year),max(year) from result_v02 where model_code=?",(mc,)))[0]
    exp_rows=48*5*4*3*21
    flag="" if n==exp_rows else f"  <-- expected {exp_rows}"
    print(f"  {mc}: rows={n}{flag} states={st} scen_presets={sc} metrics={me} {y0}-{y1}")
    nulls=list(c.execute("select count(*) from result_v02 where model_code=? and value is null",(mc,)))[0][0]
    if nulls: fail(f"{mc} has {nulls} NULL values")
    cls=list(c.execute("select model_class from model where model_code=?",(mc,)))[0][0]
    if cls!="YC": fail(f"{mc} model_class={cls} (expected YC)")

print("\n==== RESULT ====")
print("FAILS:",len(fails)); [print("  X",m) for m in fails[:25]]
print("WARNINGS:",len(warns)); [print("  !",m) for m in warns[:8]]
print("PASS" if not fails else "FAILED")
