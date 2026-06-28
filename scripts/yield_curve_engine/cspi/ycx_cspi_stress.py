#!/usr/bin/env python3
"""CSPI stress-test battery (#75). Run on Cardinal from ~/yield_curves_conus.
A. Knob sensitivity: beta x clamp sweep on the cell scalar distribution.
B. Spatial cross-validation: leave-one-ecoregion-out, does CSPI predict held-out
   asymptote within forest type vs a no-CSPI baseline.
C. Bakuzis site-ordering: CSPI productivity classes must yield monotone, non-crossing
   carbon trajectories across age (the law-like site-ordering relation).
Uses hybrid_fits (the asymptote the engine actually scales) joined to ycx_cell_cspi.csv.
"""
import csv, glob, math, statistics as st
import numpy as np

REF=56.36; N0=30
cspi={r["key"]:(float(r["cspi_mean"]),float(r["n_plots"]))
      for r in csv.DictReader(open("ycx_cell_cspi.csv")) if r["level"]=="cell"}

# join hybrid_fits carbon A per cell (ft|prov), across 48 states
rows=[]  # (ft, prov, A, n, cspi)
for f in glob.glob("ycx_*_hybrid_fits.csv"):
    for r in csv.DictReader(open(f)):
        if r.get("scope")=="cell" and r.get("response")=="carbon_lbac":
            k=r.get("ft_group","")+"|"+r.get("prov_code","")  # 2-part key matches cspi table
            try: A=float(r["A"]); n=int(r.get("n_plots") or 0)
            except: continue
            if A>0 and k in cspi:
                rows.append((r.get("ft_group",""), r.get("prov_code",""), A, n, cspi[k][0]))
ft=np.array([x[0] for x in rows]); prov=np.array([x[1] for x in rows])
A=np.array([x[2] for x in rows]); n=np.array([x[3] for x in rows],float)
C=np.array([x[4] for x in rows])
print(f"[join] {len(rows)} state-cells (hybrid carbon, A>0, CSPI present)")

def scalar(beta,clamp,cv,nn):
    raw=(cv/REF)**beta
    cl=np.clip(raw,1-clamp,1+clamp)
    return 1+(N0/(N0+nn))*(cl-1)

print("\n== A. KNOB SENSITIVITY (cell scalar; A-weighted mean |change|; % raw clamped) ==")
print(f"{'beta':>5}{'clamp':>7}{'med':>8}{'p05':>8}{'p95':>8}{'wmean|d|':>10}{'%clamp':>8}")
for beta in (0.5,1.0,1.5,2.0):
    for clamp in (0.15,0.25,0.40):
        s=scalar(beta,clamp,C,n)
        raw=(C/REF)**beta
        clamped=100*np.mean((raw<1-clamp)|(raw>1+clamp))
        wmean=np.sum(A*np.abs(s-1))/np.sum(A)
        print(f"{beta:>5}{clamp:>7}{np.median(s):>8.3f}{np.percentile(s,5):>8.3f}"
              f"{np.percentile(s,95):>8.3f}{wmean:>10.4f}{clamped:>8.1f}")

print("\n== B. SPATIAL CV (leave-one-ecoregion-out, within forest type) ==")
# model: logA = a + b*logCSPI fit on train ecoregions; baseline: ft train mean logA
se_m=se_b=cnt=0
fts_improved=0; fts_tested=0
for g in set(ft):
    m=ft==g
    if m.sum()<8: continue
    provs=set(prov[m])
    if len(provs)<3: continue
    fts_tested+=1; gse_m=gse_b=0; gc=0
    lA=np.log(A[m]); lC=np.log(C[m]); pv=prov[m]
    for hold in provs:
        tr=pv!=hold; te=pv==hold
        if tr.sum()<4 or te.sum()<1: continue
        b,a=np.polyfit(lC[tr],lA[tr],1)
        pred=a+b*lC[te]; base=lA[tr].mean()
        gse_m+=np.sum((lA[te]-pred)**2); gse_b+=np.sum((lA[te]-base)**2); gc+=te.sum()
    if gc>0:
        se_m+=gse_m; se_b+=gse_b; cnt+=gc
        if gse_m<gse_b: fts_improved+=1
rmse_m=math.sqrt(se_m/cnt); rmse_b=math.sqrt(se_b/cnt)
print(f"  forest types tested: {fts_tested}; held-out cells: {cnt}")
print(f"  RMSE(logA) baseline ft-mean = {rmse_b:.4f}")
print(f"  RMSE(logA) with CSPI        = {rmse_m:.4f}  ({100*(1-rmse_m/rmse_b):+.1f}% vs baseline)")
print(f"  forest types where CSPI improves held-out fit: {fts_improved}/{fts_tested}")

print("\n== B2. SPATIAL CV on WELL-SAMPLED cells only (n_plots>=30) ==")
keep=n>=30
ft2,prov2,A2,C2=ft[keep],prov[keep],A[keep],C[keep]
se_m=se_b=cnt=0; fi=0; ftt=0
for g in set(ft2):
    m=ft2==g
    if m.sum()<8: continue
    provs=set(prov2[m])
    if len(provs)<3: continue
    ftt+=1; gm=gb=0; gc=0
    lA=np.log(A2[m]); lC=np.log(C2[m]); pv=prov2[m]
    for hold in provs:
        tr=pv!=hold; te=pv==hold
        if tr.sum()<4 or te.sum()<1: continue
        b,a=np.polyfit(lC[tr],lA[tr],1); pred=a+b*lC[te]; base=lA[tr].mean()
        gm+=np.sum((lA[te]-pred)**2); gb+=np.sum((lA[te]-base)**2); gc+=te.sum()
    if gc>0:
        se_m+=gm; se_b+=gb; cnt+=gc
        if gm<gb: fi+=1
if cnt>0:
    print(f"  well-sampled held-out cells: {cnt}; forest types: {ftt}")
    print(f"  RMSE(logA) baseline = {math.sqrt(se_b/cnt):.4f}; with CSPI = {math.sqrt(se_m/cnt):.4f} "
          f"({100*(1-math.sqrt(se_m/cnt)/math.sqrt(se_b/cnt)):+.1f}%)")
    print(f"  forest types improved: {fi}/{ftt}")
    # in-sample within-ft partial corr on well-sampled
    xs=[];ys=[]
    for g in set(ft2):
        m=ft2==g
        if m.sum()>=5:
            xs+=list(np.log(C2[m])-np.log(C2[m]).mean()); ys+=list(np.log(A2[m])-np.log(A2[m]).mean())
    print(f"  within-ft partial corr(logCSPI,logA), well-sampled: {np.corrcoef(xs,ys)[0,1]:+.3f}")

print("\n== C. BAKUZIS SITE-ORDERING (CSPI classes -> non-crossing monotone curves) ==")
# representative hybrid carbon curve (median params), asymptote scaled by class CSPI (beta=1)
params=[]
for f in glob.glob("ycx_*_hybrid_fits.csv"):
    for r in csv.DictReader(open(f)):
        if r.get("scope")=="cell" and r.get("response")=="carbon_lbac":
            try: params.append((float(r["k"]),float(r["p"]),float(r["d"]),float(r["Astar"])))
            except: pass
k=np.median([p[0] for p in params]); p=np.median([p[1] for p in params])
d=np.median([p[2] for p in params]); As=np.median([p[3] for p in params])
qs=np.percentile(C,[12.5,37.5,62.5,87.5])  # class-representative CSPI (quartile midpoints)
Amed=np.median(A)
ages=np.arange(0,101,5)
def hyb(age,Acap): return Acap*(1-np.exp(-k*age))**p*np.exp(-d*np.maximum(0,age-As))
curves={f"Q{i+1}(CSPI={q:.0f})": hyb(ages, Amed*(q/REF)**1.0) for i,q in enumerate(qs)}
mat=np.array([curves[c] for c in curves])  # 4 x nages
# ordering: at every age >0, Q1<Q2<Q3<Q4 strictly
ok=True; bad=[]
for j,ag in enumerate(ages):
    if ag==0: continue
    col=mat[:,j]
    if not np.all(np.diff(col)>0): ok=False; bad.append(int(ag))
print(f"  class CSPI quartile midpoints: {[round(q,1) for q in qs]}")
print(f"  asymptote ordering Q1<Q2<Q3<Q4: {'PASS' if ok else 'FLAG ages '+str(bad)}")
# no crossings = ranking identical at all ages
ranks=np.argsort(mat[:,1:],axis=0)
crossfree=np.all([np.array_equal(ranks[:,0],ranks[:,j]) for j in range(ranks.shape[1])])
print(f"  no site-curve crossings across age 5-100: {'PASS' if crossfree else 'FLAG'}")
print(f"  carbon at age 100 by class (Mg-equiv units): {[round(float(x),0) for x in mat[:,-1]]}")
print("  NOTE: full Bakuzis matrix (Eichhorn/Reineke) needs HT/TPH/QMD the YC engine does")
print("        not carry; site-ordering is the applicable law-like relation here.")
