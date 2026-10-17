#!/usr/bin/env python3
"""Track A 30 m proof: CSPI scalar surface for Maine on the TreeMap grid, via rasterio
(terra not needed). Reprojects the 1 km CSPI raster onto the ME_TM_22 grid (EPSG:5070),
masks to forested TreeMap pixels, applies the production scalar clamp((CSPI/REF)^beta,0.8,1.25),
and renders. Demonstrates the unblocked 30 m raster pipeline end to end. Output at ~300 m
(decimation factor 10) to keep the proof light; finer res is the same code with a smaller factor."""
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
REF=56.36; BETA=1.5; FACT=10  # beta=1.5 (CV-optimal, deep assessment 2026-06-28); 30m*10=~300m proof grid
CLO,CHI=0.70,1.45             # clamp widened to match beta=1.5
TM="/users/PUOM0008/crsfaaron/TREEMAP/ME_TM_22.tif"
CSPI="/fs/scratch/PUOM0008/crsfaaron/cspi_v7/v2both/CSPI_v2_5component_1km.tif"
with rasterio.open(TM) as t:
    H,W=t.height//FACT, t.width//FACT
    # decimated read for forest mask + transform
    tm=t.read(1,out_shape=(1,H,W),resampling=Resampling.nearest)
    dst_tf=t.transform*t.transform.scale(t.width/W, t.height/H)
    dst_crs=t.crs; nod=t.nodata
forest=(tm!=nod)&(tm>0)
cspi=np.full((H,W),np.nan,dtype="float32")
with rasterio.open(CSPI) as c:
    reproject(source=rasterio.band(c,1),destination=cspi,
              src_transform=c.transform,src_crs=c.crs,
              dst_transform=dst_tf,dst_crs=dst_crs,resampling=Resampling.bilinear)
scal=np.clip((cspi/REF)**BETA,CLO,CHI)
scal=np.where(forest & np.isfinite(cspi),scal,np.nan)
v=scal[np.isfinite(scal)]
print(f"ME 300m grid {H}x{W}; forest pixels {int(forest.sum())}; CSPI-scalar valid {v.size}")
print(f"scalar: min {v.min():.3f} median {np.median(v):.3f} max {v.max():.3f}; %clamped {100*np.mean((v<=0.8001)|(v>=0.2499+1)):.1f}")
import os; os.makedirs("out",exist_ok=True)
# GeoTIFF
prof=dict(driver="GTiff",height=H,width=W,count=1,dtype="float32",crs=dst_crs,transform=dst_tf,nodata=np.nan,compress="deflate")
with rasterio.open("out/me_cspi_scalar_300m.tif","w",**prof) as o: o.write(scal.astype("float32"),1)
fig,ax=plt.subplots(figsize=(5,6),dpi=130)
im=ax.imshow(scal,cmap="RdBu_r",vmin=0.85,vmax=1.15); ax.set_title("Maine 30m(->300m) CSPI asymptote scalar\n(TreeMap-masked, EPSG:5070, via rasterio)",fontsize=9)
ax.set_xticks([]);ax.set_yticks([]); fig.colorbar(im,ax=ax,shrink=0.6,label="CSPI scalar")
fig.tight_layout(); fig.savefig("out/me_cspi_scalar_300m.png"); fig.set_size_inches(2.6,3.1); fig.savefig("out/me_cspi_scalar_300m_thumb.png",dpi=72)
print("wrote out/me_cspi_scalar_300m.{tif,png}")
