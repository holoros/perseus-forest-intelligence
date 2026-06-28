#!/usr/bin/env python3
"""CONUS reconciliation: flagged CSPI engine vs baseline, 48 states, rcp45.
Reads ci_full_base/ and ci_full_cspi/ ci_yc_fiadb_<st>_rcp45.csv, sums mmt_agc
across states by year for the reserve (No_harvest) and BAU scenarios, reports
CONUS t0 (2025) and 2125 base vs CSPI, per-state delta distribution, and the
sparse-cell footprint from ycx_cell_cspi.csv. Run on Cardinal after CSPI48_DONE.
"""
import csv, glob, os, math
BASE="ci_full_base"; CSPI="ci_full_cspi"

def conus(dirp, scen):
    tot={}
    for f in glob.glob(os.path.join(dirp,"ci_yc_fiadb_*_rcp45.csv")):
        st=os.path.basename(f).split("_")[3]
        for r in csv.DictReader(open(f)):
            if r["scenario"]!=scen: continue
            y=int(r["year"]); v=r.get("mmt_agc_mean","")
            if v=="" or v=="NA": continue
            tot.setdefault(y,{}); tot[y][st]=float(v)
    return tot

def line(scen):
    b=conus(BASE,scen); c=conus(CSPI,scen)
    yrs=sorted(b)
    print(f"\n== scenario {scen} (CONUS sum mmt_agc Tg C) ==")
    print(f"{'year':>6} {'base':>10} {'cspi':>10} {'delta%':>8}")
    for y in (yrs[0], yrs[len(yrs)//2], yrs[-1]):
        sb=sum(b[y].values()); sc=sum(c[y].get(st,0) for st in b[y])
        print(f"{y:>6} {sb:>10.1f} {sc:>10.1f} {100*(sc/sb-1):>+8.2f}")
    # per-state delta at 2125
    y=yrs[-1]; ds=[]
    for st in b[y]:
        if st in c[y] and b[y][st]>0: ds.append((100*(c[y][st]/b[y][st]-1), st))
    ds.sort()
    print(f"  per-state delta% at {y}: n={len(ds)} min {ds[0][0]:+.2f}({ds[0][1]}) "
          f"median {ds[len(ds)//2][0]:+.2f} max {ds[-1][0]:+.2f}({ds[-1][1]})")

def sparse():
    f="ycx_cell_cspi.csv"
    n=ns=0; sca=[]
    for r in csv.DictReader(open(f)):
        if r["level"]!="cell": continue
        n+=1; npl=float(r["n_plots"])
        if npl<30: ns+=1; sca.append(float(r["cspi_scalar"]))
    if sca:
        m=sum(sca)/len(sca)
        print(f"\n== sparse-cell footprint == {ns} of {n} cells have n_plots<30 "
              f"(full CSPI weight); their cspi_scalar mean={m:.3f}")

if __name__=="__main__":
    print("base files:", len(glob.glob(BASE+"/ci_*.csv")),
          "cspi files:", len(glob.glob(CSPI+"/ci_*.csv")))
    line("No_harvest"); line("BAU"); sparse()
