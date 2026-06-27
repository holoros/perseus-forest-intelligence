#!/usr/bin/env python3
"""
ycx_cspi_cell_covariate.py  (#75, CSPI raster-covariate path; sidesteps the #76 plot join)

Samples the wall-to-wall CSPI raster at each FIA plot's coordinates and aggregates
to the SAME cells the remeasurement curves were fit on (state x ecoregion x forest-type),
producing a coordinate-free per-cell CSPI table for asymptote scaling.

Compliance: FIA true coordinates are read only to sample the raster, here, on Cardinal.
The output table carries NO coordinates, only cell_key -> cspi_mean. Run on Cardinal.

Inputs (Cardinal):
  ~/yield_curves_conus/config/ycx_membership_<ST>.csv   (48 states; has LAT,LON,cell_key,...)
  CSPI raster (default cspi_4c_raw.tif, EPSG:4326, ~30 m)
Output:
  ~/yield_curves_conus/ycx_cell_cspi.csv

Run:  python3 ycx_cspi_cell_covariate.py [raster.tif]
"""
import os, glob, sys, csv, math
import numpy as np
import rasterio

CFG   = os.path.expanduser("~/yield_curves_conus/config")
RAST  = sys.argv[1] if len(sys.argv) > 1 else \
        "/fs/scratch/PUOM0008/crsfaaron/cspi_v7/v2both/CSPI_v2_5component_1km.tif"
OUT   = os.path.expanduser("~/yield_curves_conus/ycx_cell_cspi.csv")
CHUNK = 50000   # points per sampling batch

def load_membership():
    rows = []
    for f in sorted(glob.glob(os.path.join(CFG, "ycx_membership_*.csv"))):
        with open(f, newline="") as fh:
            for r in csv.DictReader(fh):
                try:
                    lat = float(r["LAT"]); lon = float(r["LON"])
                except (ValueError, KeyError):
                    continue
                if not (math.isfinite(lat) and math.isfinite(lon)):
                    continue
                ft = r.get("ft_group",""); prov = r.get("prov_code","")
                # Fit cells are keyed ft_group|prov_code (2-part); membership cell_key
                # adds owner (3-part). Build the 2-part key to match ycx_<ST>_remeas_fits.
                fitcell = f"{ft}|{prov}"
                rows.append((r.get("STATECD",""), fitcell,
                             ft, prov, r.get("owner4",""), lon, lat))
    return rows

def sample_raster(rows):
    vals = np.full(len(rows), np.nan, dtype="float64")
    with rasterio.open(RAST) as r:
        b = r.bounds
        print(f"[raster] {os.path.basename(RAST)} CRS={r.crs} bounds="
              f"[{b.left:.3f},{b.bottom:.3f},{b.right:.3f},{b.top:.3f}] "
              f"res={[round(v,5) for v in r.res]} nodata={r.nodata}", flush=True)
        coords = [(x[5], x[6]) for x in rows]
        for i in range(0, len(coords), CHUNK):
            block = coords[i:i+CHUNK]
            for j, v in enumerate(r.sample(block, indexes=1)):
                vv = float(v[0])
                vals[i+j] = vv if math.isfinite(vv) else np.nan
            print(f"  sampled {min(i+CHUNK,len(coords))}/{len(coords)}", flush=True)
    return vals

def agg(keys, vals):
    """mean/sd/n over finite vals grouped by key tuple."""
    d = {}
    for k, v in zip(keys, vals):
        if not math.isfinite(v):
            continue
        d.setdefault(k, []).append(v)
    out = {}
    for k, a in d.items():
        a = np.asarray(a)
        out[k] = (a.size, float(a.mean()), float(a.std(ddof=1)) if a.size > 1 else 0.0)
    return out

def main():
    rows = load_membership()
    print(f"[membership] {len(rows)} plots across {len(set(r[0] for r in rows))} states", flush=True)
    vals = sample_raster(rows)
    nfin = int(np.isfinite(vals).sum())
    print(f"[sample] valid CSPI for {nfin}/{len(vals)} plots "
          f"({100*nfin/max(1,len(vals)):.1f}%)", flush=True)
    finite = vals[np.isfinite(vals)]
    print(f"[scale] CSPI min={finite.min():.3f} median={np.median(finite):.3f} "
          f"max={finite.max():.3f}", flush=True)
    ref = float(np.median(finite))  # scale-invariant reference

    cell  = agg([r[1] for r in rows], vals)                 # full cell_key
    sp    = agg([(r[0], r[3]) for r in rows], vals)         # state x prov_code
    st    = agg([r[0] for r in rows], vals)                 # state
    conus = (finite.size, float(finite.mean()), float(finite.std(ddof=1)))

    with open(OUT, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["level","key","n_plots","cspi_mean","cspi_sd","cspi_scalar"])
        for k,(n,m,s) in sorted(cell.items()):
            w.writerow(["cell", k, n, f"{m:.5f}", f"{s:.5f}", f"{m/ref:.5f}"])
        for (state,prov),(n,m,s) in sorted(sp.items()):
            w.writerow(["state_prov", f"{state}|{prov}", n, f"{m:.5f}", f"{s:.5f}", f"{m/ref:.5f}"])
        for k,(n,m,s) in sorted(st.items()):
            w.writerow(["state", k, n, f"{m:.5f}", f"{s:.5f}", f"{m/ref:.5f}"])
        n,m,s = conus
        w.writerow(["conus", "CONUS", n, f"{m:.5f}", f"{s:.5f}", "1.00000"])
    print(f"[write] {OUT}: {len(cell)} cells, {len(sp)} state_prov, {len(st)} states "
          f"(reference median CSPI={ref:.4f}; cspi_scalar = cell_mean / reference)", flush=True)

if __name__ == "__main__":
    main()
