#!/usr/bin/env python3
"""CSPI-adjusted CONUS carbon-density raster in EPSG:5070 Albers, matching the explorer's
overlay extent (production port of ycx_cspi_raster.py). Server-side binning; only gridded
PNGs + bounds.json leave. Emits drop-in overlay PNGs (bare, alpha nodata) + *_bounds.json,
and a labeled 3-panel review figure. Run on Cardinal from ~/yield_curves_conus."""
import csv, glob, math, json, numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, matplotlib.cm as cm, matplotlib.colors as mcolors
from pyproj import Transformer

# explorer Albers extent (EPSG:5070)
X0,Y1,X1,Y0=-2561585.0,1714610.0,2463176.0,-1604872.736
RES=20000.0
nx=int(round((X1-X0)/RES)); ny=int(round((Y1-Y0)/RES))
tf=Transformer.from_crs("EPSG:4326","EPSG:5070",always_xy=True)
L2M=0.00045359237*2.4710538
scal={r["key"]:float(r["cspi_scalar"]) for r in csv.DictReader(open("ycx_cell_cspi.csv")) if r["level"]=="cell"}
def hyb(a,A,k,p): return A*(1-math.exp(-k*a))**p
def rc(x,y):
    c=int((x-X0)/RES); r=int((Y1-y)/RES)
    return (r,c) if (0<=r<ny and 0<=c<nx) else (None,None)

bs=np.zeros((ny,nx)); cs=np.zeros((ny,nx)); ct=np.zeros((ny,nx))
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
    lons=[];lats=[];dd=[];ss=[]
    for r in csv.DictReader(open(ff)):
        try: lon=float(r["LON"]);lat=float(r["LAT"]);age=float(r["STDAGE"])
        except: continue
        if not(math.isfinite(lon)and math.isfinite(lat)and math.isfinite(age)and age>0):continue
        d=hyb(age,*P.get(r.get("ft_group","")+"|"+r.get("prov_code",""),Pst))*L2M
        if not math.isfinite(d) or d<0: continue
        lons.append(lon);lats.append(lat);dd.append(d);ss.append(scal.get(r.get("ft_group","")+"|"+r.get("prov_code",""),1.0))
    if not dd: continue
    d=np.array(dd); s=np.array(ss); dc=d*s; dc=dc*(d.sum()/dc.sum())
    xs,ys=tf.transform(lons,lats)
    for x,y,db,dcv in zip(xs,ys,d,dc):
        r,c=rc(x,y)
        if r is None: continue
        bs[r,c]+=db; cs[r,c]+=dcv; ct[r,c]+=1
with np.errstate(invalid="ignore"):
    base=np.where(ct>0,bs/ct,np.nan); cspi=np.where(ct>0,cs/ct,np.nan); diff=cspi-base
print(f"Albers grid {ny}x{nx} res {RES/1000:.0f}km; filled {int(np.sum(ct>0))}")
print(f"baseline Mg C/ha mean {np.nanmean(base):.1f} max {np.nanmax(base):.1f}; mean|diff| {np.nanmean(np.abs(diff)):.2f}")

import os; os.makedirs("out",exist_ok=True)
def overlay(arr,fn,cmap,vmin,vmax):
    norm=mcolors.Normalize(vmin,vmax); rgba=cm.get_cmap(cmap)(norm(np.clip(arr,vmin,vmax)))
    rgba[...,3]=np.where(np.isfinite(arr),1.0,0.0)            # alpha 0 where nodata
    plt.imsave(fn,(rgba*255).astype(np.uint8))                # bare overlay, row0=top=Y1
    json.dump({"x0":X0,"y1":Y1,"x1":X1,"y0":Y0},open(fn.replace(".png","_bounds.json"),"w"))
vmax=float(np.nanpercentile(base,98)); dl=float(np.nanpercentile(np.abs(diff),98))
overlay(base,"out/conus_yc_agc_base.png","viridis",0,vmax)
overlay(cspi,"out/conus_yc_agc_cspi.png","viridis",0,vmax)
overlay(diff,"out/conus_yc_agc_cspidiff.png","RdBu_r",-dl,dl)
# labeled review panel
fig,ax=plt.subplots(1,3,figsize=(15,3.6),dpi=120)
for a,arr,t,cmp,vlo,vhi in [(ax[0],base,"baseline","viridis",0,vmax),(ax[1],cspi,"CSPI-adjusted","viridis",0,vmax),(ax[2],diff,"CSPI - baseline","RdBu_r",-dl,dl)]:
    im=a.imshow(arr,cmap=cmp,vmin=vlo,vmax=vhi,aspect=1.0); a.set_title(t,fontsize=10);a.set_xticks([]);a.set_yticks([]); fig.colorbar(im,ax=a,shrink=0.7)
fig.suptitle("CONUS t0 AG carbon density (Mg C/ha), EPSG:5070 Albers",fontsize=11)
fig.tight_layout(); fig.savefig("out/conus_yc_cspi_albers_review.png"); fig.set_size_inches(9,2.2); fig.savefig("out/conus_yc_cspi_albers_review_thumb.png",dpi=72)
print("wrote overlays conus_yc_agc_{base,cspi,cspidiff}.png + bounds + review panel")
