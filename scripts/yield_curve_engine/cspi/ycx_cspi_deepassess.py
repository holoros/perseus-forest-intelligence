#!/usr/bin/env python3
"""Deep CSPI assessment to decide next steps. Run on Cardinal from ~/yield_curves_conus.
Three decision-critical tests on the REMEAS cell asymptotes (where CSPI's signal lives):
  T1 optimal beta: leave-one-ecoregion-out CV held-out RMSE of log(A) for baseline (ft-mean)
     vs CSPI at free slope and capped beta in {0.5,1,1.5,2}. Finds the production beta.
  T2 CSPI vs simpler covariates: same CV skill for CSPI vs ClimateNA site index vs latitude.
     Decision: is CSPI worth the complexity over what is already available?
  T3 incremental value: within-ft partial correlation of log(A) with CSPI controlling for SI.
     If ~0, CSPI is redundant with the existing site-index product.
Covariates are cell means (ft_group|prov_code), sampled at PUBLIC plot coords (fuzz washes out
at cell scale). No outbound fetch; all rasters staged."""
import csv, glob, math, os, numpy as np, rasterio
from pyproj import Transformer

CSPI_TIF="/fs/scratch/PUOM0008/crsfaaron/cspi_v7/v2both/CSPI_v2_5component_1km.tif"
SI_TIF  ="/users/PUOM0008/crsfaaron/SiteIndex/ClimateNA_SI_m.tif"
cfg="config"; SUB=3  # subsample every SUBth plot for raster sampling (cell means stable)

# remeas carbon asymptote per cell (ft|prov), n>=10
A={}
for f in glob.glob("ycx_*_remeas_fits.csv"):
    for r in csv.DictReader(open(f)):
        if r.get("scope")=="cell" and r.get("response")=="carbon_lbac":
            try:
                a=float(r["A"]); n=int(r.get("n_plots") or 0)
            except: continue
            if a>0 and n>=10: A[r["ft_group"]+"|"+r["prov_code"]]=(a, r["ft_group"])

# gather plot coords + cell keys (subsampled)
keys=[]; lons=[]; lats=[]
for ff in sorted(glob.glob(cfg+"/ycx_membership_*.csv")):
    rows=list(csv.DictReader(open(ff)))
    for i,r in enumerate(rows):
        if i%SUB: continue
        k=r.get("ft_group","")+"|"+r.get("prov_code","")
        if k not in A: continue
        try: lo=float(r["LON"]); la=float(r["LAT"])
        except: continue
        if math.isfinite(lo) and math.isfinite(la):
            keys.append(k); lons.append(lo); lats.append(la)
lons=np.array(lons); lats=np.array(lats); keys=np.array(keys)
print(f"[join] {len(keys)} plot samples across {len(set(keys))} cells")

def sample(tif, lon, lat):
    with rasterio.open(tif) as r:
        tf=Transformer.from_crs("EPSG:4326", r.crs, always_xy=True)
        xs,ys=tf.transform(lon,lat)
        out=np.full(len(lon),np.nan)
        for i,v in enumerate(r.sample(list(zip(xs,ys)),indexes=1)):
            vv=float(v[0]); out[i]=vv if math.isfinite(vv) else np.nan
        return out
cspi=sample(CSPI_TIF,lons,lats); si=sample(SI_TIF,lons,lats)
print(f"[sample] CSPI valid {np.isfinite(cspi).mean()*100:.0f}%  SI valid {np.isfinite(si).mean()*100:.0f}%")

# cell means
def cellmean(vals):
    d={}
    for k,v in zip(keys,vals):
        if math.isfinite(v): d.setdefault(k,[]).append(v)
    return {k:np.mean(v) for k,v in d.items() if len(v)>=3}
cm_cspi=cellmean(cspi); cm_si=cellmean(si); cm_lat=cellmean(lats)
cells=[k for k in A if k in cm_cspi and k in cm_si and k in cm_lat]
ft=np.array([A[k][1] for k in cells]); y=np.log(np.array([A[k][0] for k in cells]))
X={"CSPI":np.log(np.array([cm_cspi[k] for k in cells])),
   "SI":  np.log(np.array([np.clip(cm_si[k],1e-3,None) for k in cells])),
   "LAT": np.array([cm_lat[k] for k in cells])}
prov=np.array([k.split("|")[1] for k in cells])
print(f"[cells] {len(cells)} with all covariates + asymptote")

def cv(xv):
    se_m=se_b=cnt=0
    for g in set(ft):
        m=ft==g
        if m.sum()<8 or len(set(prov[m]))<3: continue
        lA=y[m]; xx=xv[m]; pv=prov[m]
        for h in set(pv):
            tr=pv!=h; te=pv==h
            if tr.sum()<4 or te.sum()<1: continue
            b,a=np.polyfit(xx[tr],lA[tr],1)
            se_m+=np.sum((lA[te]-(a+b*xx[te]))**2); se_b+=np.sum((lA[te]-lA[tr].mean())**2); cnt+=te.sum()
    return math.sqrt(se_m/cnt), math.sqrt(se_b/cnt), cnt
def wcorr(xv):  # within-ft partial corr
    xs=[];ys=[]
    for g in set(ft):
        m=ft==g
        if m.sum()>=5: xs+=list(xv[m]-xv[m].mean()); ys+=list(y[m]-y[m].mean())
    return np.corrcoef(xs,ys)[0,1]

print("\n== T2: CSPI vs simpler covariates (leave-one-ecoregion-out CV of log asymptote) ==")
rb=None
for name in ("CSPI","SI","LAT"):
    rm,rbase,n=cv(X[name]); rb=rbase
    print(f"  {name:5s}: held-out RMSE {rm:.3f} vs baseline {rbase:.3f}  ({100*(1-rm/rbase):+.1f}%)  within-ft r={wcorr(X[name]):+.3f}")

print("\n== T3: does CSPI add over ClimateNA SI? (within-ft partial corr of logA~CSPI | SI) ==")
# residualize logA and logCSPI on SI within ft, correlate residuals
rx=[];ry=[]
for g in set(ft):
    m=ft==g
    if m.sum()<6: continue
    s=X["SI"][m]; c=X["CSPI"][m]; a=y[m]
    if np.std(s)<1e-6: continue
    bc=np.polyfit(s,c,1); rc=c-(bc[0]*s+bc[1])
    ba=np.polyfit(s,a,1); ra=a-(ba[0]*s+ba[1])
    rx+=list(rc); ry+=list(ra)
print(f"  partial corr(logA, logCSPI | SI), within-ft = {np.corrcoef(rx,ry)[0,1]:+.3f}  (n={len(rx)})")

print("\n== T1: optimal beta (apply scalar A*(CSPI/med)^beta, held-out relRMSE on A) ==")
medC=np.median(np.exp(X["CSPI"])); Aabs=np.exp(y)
print(f"  baseline ft-mean relRMSE included above; scalar-form held-out by beta:")
for beta in (0.5,1.0,1.5,2.0,2.77):
    se=base=cnt=0
    for g in set(ft):
        m=ft==g
        if m.sum()<8 or len(set(prov[m]))<3: continue
        Cm=np.exp(X["CSPI"][m]); Am=Aabs[m]; pv=prov[m]
        for h in set(pv):
            tr=pv!=h; te=pv==h
            if tr.sum()<4 or te.sum()<1: continue
            mu=np.mean(Am[tr])                      # ft-mean anchor from train
            pred=mu*(Cm[te]/np.mean(Cm[tr]))**beta
            se+=np.sum((Am[te]-pred)**2); base+=np.sum((Am[te]-mu)**2); cnt+=te.sum()
    print(f"  beta={beta:>4}: held-out relRMSE {math.sqrt(se/cnt)/np.mean(Aabs):.3f} vs flat {math.sqrt(base/cnt)/np.mean(Aabs):.3f} ({100*(1-math.sqrt(se/base)):+.1f}%)")
print("DEEPASSESS_DONE")
