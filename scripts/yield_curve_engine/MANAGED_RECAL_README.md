# FIA managed-scenario recalibration (MUST run after every FIA series regeneration)

The FIA managed buckets (`yc_fia_empirical_v1`, `managed (*)`) are produced by the
projector as a WHOLE-LANDSCAPE rotation, which is unrealistic (it harvests every acre
and drives an implausible CONUS decline that disagrees with FIA, net +1.1%/yr, and the
other engines). The realistic managed scenarios are produced by a post-projection step:

    python3 ycx_blend_fia_datadriven.py <public/api> docs/results/fia_mgmt_shares_bystate.csv

which blends each managed bucket with reserve using FIADB-derived per-state working
fractions (harvested_share for harvest/conservation, planted_share for intensive;
reserved land excluded). Build `fia_mgmt_shares_bystate.csv` with `ycx_mgmt_shares.R`.

IMPORTANT: any process that regenerates the FIA series (e.g. CBM/GCBM ingests) reverts
the managed buckets to whole-landscape rotation. This step MUST be re-run as the last
stage of that regeneration, or the managed scenarios will show spurious declines.
