#!/usr/bin/env python3
"""CSPI-adjusted CONUS t0 carbon-density raster (#75 spatial integration prototype).
Run on Cardinal from ~/yield_curves_conus. FIA true coordinates are binned to a ~0.25 deg
grid server-side; only the gridded PNG/array leaves (no point coords). Produces:
  baseline density (modeled t0 carbon, Mg C/ha), CSPI-adjusted density (per-cell CSPI scalar,
  renormalized per state to preserve the FIA-anchored state total), and their difference.
Density per plot = remeas carbon curve at STDAGE; CSPI scalar from ycx_cell_cspi.csv."""
import csv, glob, math, numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt

L2M=0.00045359237*2.4710538
scal={r["key"]:float(r["cspi_scalar"]) for r in csv.DictReader(open("ycx_cell_cspi.csv")) if r["level"]=="cell"}
def hyb(a,A,k,p): return A*(1-math.exp(-k*a))**p
# grid
LON0,LON1,LAT0,LAT1,RES=-125.0,-66.0,24.0,50.0,0.25
nx=int((LON1-LON0)/RES); ny=int((LAT1-LAT0)/RES)
base_sum=np.zeros((ny,nx)); cspi_sum=np.zeros((ny,nx)); cnt=np.zeros((ny,nx))
def ix(lon,lat):
    c=int((lon-LON0)/RES); r=int((LAT1-lat)/RES)
    return (r,c) if (0<=r<ny and 0<=c<nx) else (None,None)

for ff in sorted(glob.glob("config/ycx_membership_*.csv")):
    ST=ff.split("_")[-1].split(".")[0]
    try: fits=list(csv.DictReader(open(f"ycx_{ST}_remeas_fits.csv")))
    except: continue
    P={}; Pst=None
    for r in fits:
        if r.get("response")!="carbon_lbac": continue
        try: v=(float(r["A"]),float(r["k"]),float(r["p"]))
        except: continue
        if r["scope"]=="state": Pst=v
        elif r["scope"]=="cell": P[r["ft_group"]+"|"+r["prov_code"]]=v
    if Pst is None: continue
    rows=[]
    for r in csv.DictReader(open(ff)):
        try: lon=float(r["LON"]); lat=float(r["LAT"]); age=float(r["STDAGE"])
        except: continue
        if not (math.isfinite(lon) and math.isfinite(lat) and math.isfinite(age) and age>0): continue
        key=r.get("ft_group","")+"|"+r.get("prov_code","")
        d=hyb(age,*P.get(key,Pst))*L2M
        if not math.isfinite(d) or d<0: continue
        rows.append((lon,lat,d,scal.get(key,1.0)))
    if not rows: continue
    d=np.array([x[2] for x in rows]); s=np.array([x[3] for x in rows])
    dc=d*s; dc=dc*(d.sum()/dc.sum())   # renormalize within state -> preserve state total
    for (lon,lat,_,_),db,dcv in zip(rows,d,dc):
        r,c=ix(lon,lat)
        if r is None: continue
        base_sum[r,c]+=db; cspi_sum[r,c]+=dcv; cnt[r,c]+=1

with np.errstate(invalid="ignore"):
    base=np.where(cnt>0, base_sum/cnt, np.nan)
    cspi=np.where(cnt>0, cspi_sum/cnt, np.nan)
    diff=cspi-base
print(f"grid {ny}x{nx}; filled cells {int(np.sum(cnt>0))}")
fin=np.isfinite(base)
print(f"baseline density Mg C/ha: min {np.nanmin(base):.1f} mean {np.nanmean(base):.1f} max {np.nanmax(base):.1f}")
print(f"CSPI-baseline diff: min {np.nanmin(diff):.2f} mean {np.nanmean(diff):.3f} max {np.nanmax(diff):.2f} Mg/ha")
print(f"abs reallocation: mean |diff| {np.nanmean(np.abs(diff)):.3f} Mg/ha; cells with |diff|>1: {int(np.nansum(np.abs(diff)>1))}")

ext=[LON0,LON1,LAT0,LAT1]
def render(arr,title,fn,cmap,vmin=None,vmax=None,dpi=130):
    fig,ax=plt.subplots(figsize=(8,4.2),dpi=dpi)
    im=ax.imshow(arr,extent=ext,origin="upper",cmap=cmap,vmin=vmin,vmax=vmax,aspect=1.3)
    ax.set_title(title,fontsize=10); ax.set_xticks([]); ax.set_yticks([])
    fig.colorbar(im,ax=ax,shrink=0.7,label="Mg C/ha")
    fig.tight_layout(); fig.savefig(fn); fig.set_size_inches(4,2.1); fig.savefig(fn.replace(".png","_thumb.png"),dpi=72); plt.close(fig)
import os; os.makedirs("out",exist_ok=True)
vmax=np.nanpercentile(base,98)
render(base,"CONUS t0 AG carbon density (baseline, remeas)","out/cspi_raster_base.png","viridis",0,vmax)
render(cspi,"CONUS t0 AG carbon density (CSPI-adjusted)","out/cspi_raster_cspi.png","viridis",0,vmax)
dl=np.nanpercentile(np.abs(diff),98)
render(diff,"CSPI reallocation (CSPI - baseline)","out/cspi_raster_diff.png","RdBu_r",-dl,dl)
print("wrote out/cspi_raster_{base,cspi,diff}.png (+thumbs)")
