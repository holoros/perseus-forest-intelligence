#!/usr/bin/env python3
"""Per-forest-type CSPI slope calibration vs a single global beta. Run on Cardinal from
~/yield_curves_conus. Decision: does calibrating the CSPI->asymptote slope per forest type
improve held-out skill enough to justify the added complexity over a single global beta=1.5?
Leave-one-ecoregion-out CV on the remeas cell asymptotes; cell CSPI from ycx_cell_cspi.csv."""
import csv, glob, math, numpy as np
cm={r["key"]:float(r["cspi_mean"]) for r in csv.DictReader(open("ycx_cell_cspi.csv")) if r["level"]=="cell"}
rows=[]
for f in glob.glob("ycx_*_remeas_fits.csv"):
    for r in csv.DictReader(open(f)):
        if r.get("scope")=="cell" and r.get("response")=="carbon_lbac":
            k=r["ft_group"]+"|"+r["prov_code"]
            try: a=float(r["A"]); n=int(r.get("n_plots") or 0)
            except: continue
            if a>0 and n>=10 and k in cm: rows.append((r["ft_group"], r["prov_code"], math.log(a), math.log(cm[k])))
ft=np.array([x[0] for x in rows]); prov=np.array([x[1] for x in rows])
y=np.array([x[2] for x in rows]); x=np.array([x[3] for x in rows])
REF=math.log(56.36)
print(f"cells: {len(rows)}; forest types: {len(set(ft))}")

# global slope via within-ft demeaning (the single-beta production model)
def cv(per_ft):
    se=base=cnt=0
    for g in set(ft):
        m=ft==g
        if m.sum()<8 or len(set(prov[m]))<3: continue
        lA=y[m]; lC=x[m]; pv=prov[m]
        for h in set(pv):
            tr=pv!=h; te=pv==h
            if tr.sum()<4 or te.sum()<1: continue
            if per_ft:
                b,a=np.polyfit(lC[tr],lA[tr],1)          # slope fit on THIS ft's train cells
            else:
                # global slope: pool within-ft-demeaned over all OTHER fts+train
                xs=[];ys=[]
                for g2 in set(ft):
                    mm=(ft==g2)
                    if g2==g: mm=mm&(prov!=h)            # exclude held-out ecoregion of this ft
                    if mm.sum()>=3: xs+=list(x[mm]-x[mm].mean()); ys+=list(y[mm]-y[mm].mean())
                b=np.sum(np.array(xs)*np.array(ys))/np.sum(np.array(xs)**2); a=lA[tr].mean()-b*lC[tr].mean()
            pred=a+b*lC[te]; mu=lA[tr].mean()
            se+=np.sum((lA[te]-pred)**2); base+=np.sum((lA[te]-mu)**2); cnt+=te.sum()
    return math.sqrt(se/cnt), math.sqrt(base/cnt), cnt

gm,gb,gn=cv(False); pm,pb,pn=cv(True)
print(f"\nGlobal-slope model:   held-out RMSE {gm:.3f} vs baseline {gb:.3f}  ({100*(1-gm/gb):+.1f}%)")
print(f"Per-forest-type model: held-out RMSE {pm:.3f} vs baseline {pb:.3f}  ({100*(1-pm/pb):+.1f}%)")
print(f"Per-ft improvement over global: {100*(1-pm/gm):+.1f}%")

# per-ft slopes (full-data fit, n>=10 cells, >=3 ecoregions) to show heterogeneity
print("\nPer-forest-type CSPI slopes (log-log, full data):")
sl=[]
for g in sorted(set(ft)):
    m=ft==g
    if m.sum()>=10 and len(set(prov[m]))>=3:
        b=np.polyfit(x[m],y[m],1)[0]; sl.append(b)
        print(f"  {g:28s} n={m.sum():4d}  slope={b:+.2f}")
sl=np.array(sl)
print(f"\nslope spread: median {np.median(sl):.2f}  IQR [{np.percentile(sl,25):.2f},{np.percentile(sl,75):.2f}]  range [{sl.min():.2f},{sl.max():.2f}]")
print("DECISION: per-ft worth it if it beats global by >~2-3% held-out AND slopes vary widely.")
print("PERFT_DONE")
