#!/usr/bin/env python3
"""Publication-quality CSPI validation summary figure (3 panels). Headless (Agg). Values from
the deep assessment (20260628_cspi_deep_assessment.md) and per-ft addendum. Run on Cardinal."""
import numpy as np, matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
plt.rcParams.update({"font.size":9,"axes.spines.top":False,"axes.spines.right":False})
fig,ax=plt.subplots(1,3,figsize=(12,3.6),dpi=200)

# Panel A: out-of-sample skill by covariate
cov=["CSPI","Latitude","ClimateNA\nsite index"]; sk=[8.4,3.7,0.9]
c=["#1b7837","#7fbf7b","#b8b8b8"]
ax[0].bar(cov,sk,color=c,edgecolor="black",linewidth=0.5)
for i,v in enumerate(sk): ax[0].text(i,v+0.2,f"+{v}%",ha="center",fontsize=9,fontweight="bold")
ax[0].set_ylabel("held-out skill gain (%)\nleave-one-ecoregion-out CV")
ax[0].set_title("A. CSPI vs simpler covariates",fontsize=10,loc="left")
ax[0].set_ylim(0,10)

# Panel B: held-out skill vs beta
beta=[0.5,1.0,1.5,2.0,2.77]; imp=[3.5,6.5,8.8,10.5,11.5]
ax[1].plot(beta,imp,"-o",color="#1b7837",lw=2,ms=6)
ax[1].axvline(1.5,ls="--",color="#d95f0e",lw=1.2); ax[1].text(1.55,4,"production\nbeta=1.5",color="#d95f0e",fontsize=8)
ax[1].set_xlabel("scaling exponent  beta"); ax[1].set_ylabel("held-out skill gain (%)")
ax[1].set_title("B. Optimal beta (rises with steepness)",fontsize=10,loc="left")
ax[1].set_ylim(0,13)

# Panel C: per-forest-type CSPI slope distribution
sl={"Douglas-fir":5.75,"Fir/spruce/mtn hemlock":5.09,"Oak/hickory":4.03,"Other eastern softwoods":3.97,
"Aspen/birch":3.46,"Woodland hardwoods":3.46,"Hemlock/Sitka spruce":3.77,"Elm/ash/cottonwood":2.87,
"Ponderosa pine":2.48,"Exotic softwoods":1.97,"Oak/gum/cypress":1.83,"Spruce/fir":1.68,"Alder/maple":1.67,
"Oak/pine":1.48,"Pinyon/juniper":1.10,"Other western softwoods":0.93,"Lodgepole pine":0.88,
"Exotic hardwoods":0.85,"White/red/jack pine":0.60,"Western larch":0.39,"Longleaf/slash pine":0.08,
"Maple/beech/birch":-0.40,"Western oak":-0.63,"Loblolly/shortleaf pine":-0.85}
items=sorted(sl.items(),key=lambda t:t[1])
names=[k for k,_ in items]; vals=[v for _,v in items]
cols=["#b2182b" if v<0.2 else "#2166ac" for v in vals]
ax[2].barh(range(len(vals)),vals,color=cols,edgecolor="black",linewidth=0.3)
ax[2].set_yticks(range(len(vals))); ax[2].set_yticklabels(names,fontsize=5.5)
ax[2].axvline(1.5,ls="--",color="#d95f0e",lw=1); ax[2].axvline(0,color="black",lw=0.6)
ax[2].set_xlabel("CSPI->asymptote slope (log-log)")
ax[2].set_title("C. Slope varies by forest type",fontsize=10,loc="left")
ax[2].text(1.6,1,"global\n1.5",color="#d95f0e",fontsize=7)

fig.suptitle("CSPI as a yield-curve site-productivity covariate: out-of-sample validation",fontsize=11,y=1.02)
fig.tight_layout()
fig.savefig("out/cspi_validation_figure.png",bbox_inches="tight")
fig.savefig("out/cspi_validation_figure.pdf",bbox_inches="tight")
fig.set_size_inches(7,2.1); fig.savefig("out/cspi_validation_figure_thumb.png",dpi=72,bbox_inches="tight")
print("wrote out/cspi_validation_figure.{png,pdf} + thumb")
