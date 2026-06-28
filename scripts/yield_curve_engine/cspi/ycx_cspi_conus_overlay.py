#!/usr/bin/env python3
"""Track 1: CONUS CSPI scalar overlay at native ~1 km on the explorer's EPSG:5070 Albers grid.
Drop-in for public/raster/. Reprojects the 1 km CSPI raster onto the explorer extent, applies
the production scalar clamp((CSPI/REF)^beta,0.8,1.25). This is the reusable CONUS CSPI multiplier
(the source CSPI is 1 km, so 1 km is its native resolution; 30 m applies only to forest-type
density products). Run on Cardinal from ~/yield_curves_conus."""
import numpy as np, rasterio, json
from rasterio.warp import reproject, Resampling
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, matplotlib.cm as cm, matplotlib.colors as mcolors
X0,Y1,X1,Y0=-2561585.0,1714610.0,2463176.0,-1604872.736
REF=56.36; BETA=1.5; RES=1000.0   # beta raised to CV-optimal 1.5 (deep assessment 2026-06-28)
CLO,CHI=0.70,1.45                  # clamp widened from [0.80,1.25] to admit the stronger beta
nx=int(round((X1-X0)/RES)); ny=int(round((Y1-Y0)/RES))
from affine import Affine
dst_tf=Affine(RES,0,X0,0,-RES,Y1)
cspi=np.full((ny,nx),np.nan,dtype="float32")
with rasterio.open("/fs/scratch/PUOM0008/crsfaaron/cspi_v7/v2both/CSPI_v2_5component_1km.tif") as c:
    reproject(source=rasterio.band(c,1),destination=cspi,src_transform=c.transform,src_crs=c.crs,
              dst_transform=dst_tf,dst_crs="EPSG:5070",resampling=Resampling.bilinear)
scal=np.where(np.isfinite(cspi),np.clip((cspi/REF)**BETA,CLO,CHI),np.nan)
v=scal[np.isfinite(scal)]
print(f"CONUS 1km Albers grid {ny}x{nx}; valid {v.size}; scalar min {v.min():.3f} median {np.median(v):.3f} max {v.max():.3f}")
import os; os.makedirs("out",exist_ok=True)
# drop-in overlay (bare RGBA, alpha nodata) + bounds.json
norm=mcolors.Normalize(0.8,1.25); rgba=cm.get_cmap("RdBu_r")(norm(np.clip(scal,0.8,1.25)))
rgba[...,3]=np.where(np.isfinite(scal),1.0,0.0)
plt.imsave("out/conus_cspi_scalar.png",(rgba*255).astype(np.uint8))
json.dump({"x0":X0,"y1":Y1,"x1":X1,"y0":Y0},open("out/conus_cspi_scalar_bounds.json","w"))
# GeoTIFF for reuse as a multiplier layer
prof=dict(driver="GTiff",height=ny,width=nx,count=1,dtype="float32",crs="EPSG:5070",transform=dst_tf,nodata=np.nan,compress="deflate")
with rasterio.open("out/conus_cspi_scalar.tif","w",**prof) as o: o.write(scal.astype("float32"),1)
# labeled review
fig,ax=plt.subplots(figsize=(8,4.4),dpi=130)
im=ax.imshow(scal,cmap="RdBu_r",vmin=0.85,vmax=1.15,aspect=1.0); ax.set_title("CONUS CSPI asymptote scalar (1km, EPSG:5070)",fontsize=10)
ax.set_xticks([]);ax.set_yticks([]); fig.colorbar(im,ax=ax,shrink=0.7,label="CSPI scalar")
fig.tight_layout(); fig.savefig("out/conus_cspi_scalar_review.png"); fig.set_size_inches(4,2.2); fig.savefig("out/conus_cspi_scalar_review_thumb.png",dpi=72)
print("wrote out/conus_cspi_scalar.{png,tif} + bounds.json + review")
