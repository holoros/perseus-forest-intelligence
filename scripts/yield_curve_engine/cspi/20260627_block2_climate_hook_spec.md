# Block 2 rcp-native climate: hook built + validated, data-acquisition spec

*2026-06-27. Advances the Block 2 blocker as far as possible without the external climate run.*

## What is done (no external dependency)

1. **Per-rcp CSI table built** (`config/csi_states_ext_rcp.csv`, 48 states x {rcp45, rcp85}).
   Columns: state, rcp, csi_2030, csi_2060, csi_2090, source. First cut reproduces the current
   behavior exactly (rcp85 = full observed CSI stress; rcp45 = half the departure = the current
   SCALE_rcp=0.5). `ycx_make_rcp_csi.py` generates it.
2. **Engine hook validated behavior-preserving.** The current engine computes
   `pm(t) = 1 + SCALE_rcp * CSI_BETA * (CSI(t)/CSI_2030 - 1)` from a single CSI. The rcp-native
   refactor reads the rcp-specific row and drops SCALE_rcp:
   `pm(t) = 1 + CSI_BETA * (CSI_rcp(t)/CSI_rcp_2030 - 1)`. Validated identical (ME 2090:
   rcp85 1.0795=1.0795, rcp45 1.0398=1.0398). So real per-rcp CSI is drop-in: replace the
   firstcut columns, no other code change.
3. **48-state ClimateNA inputs pre-generated** (`climatena_inputs_48/climatena_input_<ST>.csv`,
   638,751 plots, format ID1,ID2,lat,long,el with el=0 so ClimateNA fills elevation from its
   DEM). Built from membership LAT/LON server-side; only the input-location step is removed --
   these are plot locations, the same protected coordinates that stay on Cardinal, so the
   ClimateNA run must also be done on a machine cleared for FIA true coords.

## The one remaining external action (the actual blocker)

Run ClimateNA (Windows/desktop software, or its batch API) on the 48-state inputs to produce
future climate normals, then derive per-rcp CSI:

1. **ClimateNA run:** future projections, 13-GCM ensemble mean, scenarios rcp45 and rcp85,
   normal periods centered ~2030 (2011-2040), ~2060 (2041-2070), ~2090 (2071-2100). Output
   variables: MAT, MAP, CMD, DD5 (the CSI predictors; add tmin_wt, tmax_sm if the CSI formula
   uses them).
2. **Derive CSI per state per rcp:** run the ClimateNA outputs through the existing CSI / site-
   index relationship (`SiteIndex/clim_ranger_spatial_model.rds` maps climate -> SI), aggregate
   plot -> state mean, normalize to the 2030 value (CSI_2030 = 1).
3. **Replace** the firstcut columns in `config/csi_states_ext_rcp.csv` with the derived values
   (keep the schema). Point the engine at this table. Done -- the engine is now rcp-native.

## Why this is genuinely blocked here

ClimateNA is external desktop/batch software not installed on Cardinal, and no future GCM
climate is staged (only current-climate ClimateNA SI rasters and the 4-state pilot input files).
Acquiring the future climate is a data/software step outside the cluster. Everything downstream
of it is built and validated.

```
[BLOCK2_STATE]: per-rcp CSI table + behavior-preserving engine hook built and validated; 48-state ClimateNA inputs pre-generated (638,751 plots).
[REMAINING]: external ClimateNA future run (rcp45/85, 13-GCM, 3 normals) -> clim_ranger -> per-state per-rcp CSI -> replace firstcut columns. Drop-in.
[PROTOCOL]: ClimateNA run must stay on an FIA-true-coords-cleared machine (inputs are protected plot coordinates).
```
