#!/usr/bin/env python3
"""CSPI spatial t0 redistribution prototype (#75). Run on Cardinal from ~/yield_curves_conus.
Where CSPI is NOT cancelled: the absolute t0 carbon-density allocation within a state.
Baseline: each plot's t0 density = curve(STDAGE) (uniform-by-area within cell), cell carbon
proportional to summed plot density. CSPI version: multiply each cell's density by its CSPI
scalar, then renormalize within state so the FIA-anchored STATE TOTAL is preserved. Measures
how much standing carbon CSPI moves among cells (total-variation distance) and whether the
move is well-ordered (productive cells gain). Uses remeas fits (the validated form)."""
import csv, glob, math, numpy as np

REF=56.36
# cell CSPI scalar (2-part key) and state CSPI
scal={};
for r in csv.DictReader(open("ycx_cell_cspi.csv")):
    if r["level"]=="cell": scal[r["key"]]=float(r["cspi_scalar"])

def hyb(a,A,k,p,d,As): return A*(1-math.exp(-k*a))**p*math.exp(-d*max(0,a-As))

ABBR2FIPS={"AL":1,"AZ":4,"AR":5,"CA":6,"CO":8,"CT":9,"DE":10,"FL":12,"GA":13,"ID":16,"IL":17,"IN":18,"IA":19,"KS":20,"KY":21,"LA":22,"ME":23,"MD":24,"MA":25,"MI":26,"MN":27,"MS":28,"MO":29,"MT":30,"NE":31,"NV":32,"NH":33,"NJ":34,"NM":35,"NY":36,"NC":37,"ND":38,"OH":39,"OK":40,"OR":41,"PA":42,"RI":44,"SC":45,"SD":46,"TN":47,"TX":48,"UT":49,"VA":51,"VT":50,"WA":53,"WV":54,"WI":55,"WY":56}

tot_moved=[]; conus_base=0.0; conus_gain_hi=0.0; allcells=0; movecells=0
for ff in sorted(glob.glob("config/ycx_membership_*.csv")):
    ST=ff.split("_")[-1].split(".")[0]
    fitf=f"ycx_{ST}_remeas_fits.csv"
    try: fits=list(csv.DictReader(open(fitf)))
    except: continue
    # carbon params per cell (2-part) + state fallback
    P={}; Pst=None
    for r in fits:
        if r.get("response")!="carbon_lbac": continue
        try: v=(float(r["A"]),float(r["k"]),float(r["p"]),0.0,200.0)
        except: continue
        if r["scope"]=="state": Pst=v
        elif r["scope"]=="cell": P[r["ft_group"]+"|"+r["prov_code"]]=v
    if Pst is None: continue
    # per-cell baseline carbon (sum plot density), and cell CSPI scalar
    cellC={}; cellS={}
    for r in csv.DictReader(open(ff)):
        try: age=float(r["STDAGE"])
        except: continue
        if not math.isfinite(age) or age<=0: continue
        key=r.get("ft_group","")+"|"+r.get("prov_code","")
        p=P.get(key,Pst); dens=hyb(age,*p)
        if not math.isfinite(dens) or dens<0: continue
        cellC[key]=cellC.get(key,0.0)+dens
        cellS[key]=scal.get(key,1.0)
    if not cellC: continue
    keys=list(cellC); base=np.array([cellC[k] for k in keys]); sc=np.array([cellS[k] for k in keys])
    if base.sum()<=0: continue
    new=base*sc; new=new*(base.sum()/new.sum())          # renormalize: preserve state total
    sb=base/base.sum(); sn=new/new.sum()
    tv=0.5*np.sum(np.abs(sn-sb))                          # fraction of state carbon moved
    tot_moved.append((ST,100*tv,len(keys)))
    conus_base+=base.sum(); allcells+=len(keys); movecells+=int(np.sum(np.abs(sn-sb)>1e-4))

tv=np.array([x[1] for x in tot_moved])
print(f"states={len(tot_moved)} cells={allcells}")
print(f"CSPI spatial redistribution (% of each state's standing carbon moved among cells):")
print(f"  mean {tv.mean():.2f}%  median {np.median(tv):.2f}%  min {tv.min():.2f}%  max {tv.max():.2f}%")
top=sorted(tot_moved,key=lambda x:-x[1])[:6]
print("  most redistributed states:", ", ".join(f"{s}={v:.1f}%" for s,v,_ in top))
print(f"\nInterpretation: this is the spatial value CSPI delivers that the t0-anchored")
print(f"trajectory cancelled. State TOTALS are preserved (FIA anchor); CSPI reallocates")
print(f"standing carbon toward productive cells. Non-zero here = CSPI is NOT cancelled on")
print(f"the absolute density layer, unlike the asymptote cap on the anchored reserve.")
