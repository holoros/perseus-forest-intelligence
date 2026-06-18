#!/usr/bin/env python3
"""Zonal-mean the CONUS harvest-probability rasters by EPA Level III ecoregion.

Inputs (on Cardinal, ~/conus_render/): ph_any.tif, ph_clearcut.tif,
ph_partial.tif — single-band float32 P(harvest) at ~3.1 km Albers, plus the
EPA L3 polygons (public/geo/us_eco_l3_features.geojson, WGS84).
Output: public/api/ecoregion_harvest_summary.json (mean P by L3 code).

Run: python3 scripts/build_ecoregion_harvest_summary.py  (needs rasterio, pyproj)
The .tif inputs are not committed (each ~6.8 MB); pull from Cardinal first.
"""
import json, numpy as np, rasterio, sys
from rasterio.features import rasterize
from pyproj import Transformer
ALBERS="+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=37.5 +lon_0=-96 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs"
GEO=sys.argv[1] if len(sys.argv)>1 else "public/geo/us_eco_l3_features.geojson"
tr=Transformer.from_crs("EPSG:4326",ALBERS,always_xy=True)
def reproj(g):
    def rc(c): return [rc(x) if isinstance(x[0],(list,tuple)) else list(tr.transform(x[0],x[1])) for x in c]
    return {"type":g["type"],"coordinates":rc(g["coordinates"])}
gj=json.load(open(GEO)); feats=gj["features"]; codes={}; meta={}
for f in feats:
    p=f["properties"]; code=p.get("NA_L3CODE")
    if code is None: continue
    if code not in codes: codes[code]=len(codes)+1; meta[code]={"name":p.get("NA_L3NAME"),"l1":p.get("NA_L1NAME")}
shapes=[(reproj(f["geometry"]),codes[f["properties"]["NA_L3CODE"]]) for f in feats
        if f["properties"].get("NA_L3CODE") and f.get("geometry")]
with rasterio.open("ph_any.tif") as r: transform=r.transform; H,W=r.height,r.width
zone=rasterize(shapes,out_shape=(H,W),transform=transform,fill=0,dtype="int32"); K=len(codes)+1
fields={"p_harvest_any":"ph_any.tif","p_harvest_clearcut":"ph_clearcut.tif","p_harvest_partial":"ph_partial.tif"}
band={}
for key,fn in fields.items():
    with rasterio.open(fn) as r: a=r.read(1).astype("float64"); nod=r.nodata
    valid=np.isfinite(a)&(zone>0)
    if nod is not None: valid&=(a!=nod)
    band[key]=(np.bincount(zone[valid],weights=a[valid],minlength=K),np.bincount(zone[valid],minlength=K))
inv={v:k for k,v in codes.items()}; out={}
for i in range(1,K):
    if band["p_harvest_any"][1][i]<5: continue
    code=inv[i]; rec={"name":meta[code]["name"],"l1":meta[code]["l1"],"npix":int(band["p_harvest_any"][1][i])}
    for key in fields:
        s,cc=band[key]; rec[key]=round(float(s[i]/cc[i]),4) if cc[i]>0 else None
    out[code]=rec
json.dump({"meta":{"source":"conus_render ph_*.tif harvest probability (TreeMap-based, ~3.1km Albers) zonal mean by EPA L3 ecoregion","n_ecoregions":len(out),"fields":list(fields.keys()),"note":"Per-EPA-Level-III-ecoregion mean harvest probability. P(any), P(stand-replacement), P(partial)."},"ecoregions":out},open("public/api/ecoregion_harvest_summary.json","w"))
print("wrote", len(out), "ecoregions")
