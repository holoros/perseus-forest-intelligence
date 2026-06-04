# FIA managed-scenario recalibration (now baked into the fullseries CSVs)

The FIA projector emits the managed buckets as a WHOLE-LANDSCAPE rotation (every acre
harvested), which is unrealistic: it drives an implausible CONUS decline that disagrees
with the FIA record (net +1.1%/yr) and the other engines. The realistic managed scenarios
use FIADB-derived per-state working fractions:

- managed (harvest) / (conservation): phi = harvested_share (FIA harvest treatment share)
- managed (intensive): phi = planted_share (STDORGCD=1 plantations only)
- reserved (RESERVCD) land is excluded by construction (never harvested or planted)
- managed = phi * full_rotation + (1 - phi) * reserve

## Durable integration (current approach)

The recalibration is BAKED directly into the FIA fullseries CSVs on Cardinal, which are
the canonical input the dashboard ingest reads:

    /users/PUOM0008/crsfaaron/yield_curves_conus/treemap/recal_cell/fia_hybrid_fullseries_*.csv

so any re-injection of the FIA series produces correct managed buckets with no post step.
The original whole-landscape rotation is preserved alongside as *.full.csv.

Per-state shares: docs/results/fia_mgmt_shares_bystate.csv (built by ycx_mgmt_shares.R).

## When to re-run the bake

The bake must be re-applied ONLY if the FIA projector is re-run (it regenerates the CSVs
as whole-landscape rotation). After any such projector run:

    cd <fullseries dir>
    python3 ycx_bake_managed_csv.py <shares.csv> fia_hybrid_fullseries_*.csv

Ingests that merely re-inject the existing CSVs (e.g. CBM/GCBM engine ingests) do NOT
need this, because the CSVs already carry the recalibrated managed trajectories.

## Fallback (operate on the JSON instead of the CSVs)

If a process produces full-rotation managed JSON directly, the same recalibration can be
applied post-injection: `ycx_blend_fia_datadriven.py <public/api> <shares.csv>`.
