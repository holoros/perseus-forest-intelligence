# Hybrid yield form, product allocation, and FIADB vs TreeMap expansion (pilot)

Pilot over ME, MN, IN, WA, GA. Cardinal job `ycx_hybpilot`. Full 48-state run
queued as `ycx_hybconus`. Scripts in `scripts/yield_curve_engine/`.

## 1. Hybrid yield form: Chapman-Richards with a decline tail

The engine currently uses the peak-decline form `b1 * age^b2 * b3^age`, chosen
to avoid unbounded accumulation over a 100 year horizon. A 5-fold CV stress
test of four candidate forms on the FIA chronosequence (AG carbon, lb/ac) shows
that choice carries a real fit penalty:

| Form | Pooled CV RMSE | Notes |
|---|---|---|
| Chapman-Richards `A(1-exp(-k*age))^p` | 21,290 | asymptotic, best fit |
| Hybrid: CR x decline tail beyond A* | 24,917 | CR where A* is past the data; decline where it is not |
| Peak-decline `b1*age^b2*b3^age` (current) | 25,965 | current engine form |
| Re-anchored peak-decline (peak fixed at A*) | 26,466 | worst |

Chapman-Richards fits best because, in the FIA chronosequence, AG carbon in most
northern forests does not decline before roughly 200 years. The empirical
culmination age A* hits the 200 yr ceiling for ME and MN, so the hybrid there
reduces exactly to CR (RMSE 20,213 vs CR 20,211). Where forests genuinely
culminate earlier the breakpoint is real and the decline engages: GA A* = 125,
IN 155, WA 175.

### Recommendation

Adopt the **hybrid** as the production growth form: Chapman-Richards up to a
forest-type x ecoregion breakpoint A*, then a smooth exponential decline tail
beyond it. It recovers CR's superior growth-phase fit while still bounding
old-stand carbon and adding senescence exactly where the chronosequence
supports it. The breakpoint is the empirical culmination age per
forest-type x ecoregion cell (`ycx_hybrid_modelform.R`, `hybrid_cell_astar.csv`),
with forest-type then state fallback for thin cells.

## 2. Product allocation: sawtimber / pulpwood / residue

`ycx_products.R` allocates standing volume and biomass into three products,
softwood and hardwood tracked separately, using FIA size thresholds (softwood
sawtimber DBH >= 9 in, hardwood >= 11 in; poletimber 5 in to threshold) and
FIA's own volume partitions (VOLCSNET sawlog, VOLCFNET merch, DRYBIO_SAWLOG /
BOLE / AG). Fractions are computed per cell and per age class (<40, 40-80, 80+)
so allocation tracks the sawtimber shift as stands mature.

Pilot state product mix (fraction of merch volume in sawtimber vs pulpwood;
fraction of AG biomass in residue):

| State | sawtimber vol | pulpwood vol | residue (of AG bio) |
|---|---|---|---|
| WA | 0.87 | 0.13 | 0.32 |
| IN | 0.65 | 0.35 | 0.43 |
| GA | 0.56 | 0.44 | 0.47 |
| ME | 0.47 | 0.53 | 0.60 |
| MN | 0.37 | 0.63 | 0.56 |

Pacific Northwest Douglas-fir (WA) is overwhelmingly sawtimber; northern
aspen-birch and spruce-fir (ME, MN) carry more pulpwood and a larger non-merch
residue share. These fractions multiply the projected yield to give
product-specific yield trajectories.

## 3. FIADB vs TreeMap area expansion

`ycx_fiadb_vs_treemap.R` compares the same yield curves expanded two ways for
AG live carbon (reserve, no harvest): the uniform-grid FIADB model
(`yc_fia_empirical_v1`, area = n_plots x A0 anchored to FIA carbon totals) and
the spatially explicit TreeMap pixel-area model (`yc_treemap_spatial_v1`).

CONUS totals: FIADB 11,002 -> 17,544 Tg C (+60%); TreeMap 10,352 -> 14,813 Tg C
(+43%); national t0 ratio TreeMap/FIADB 0.94. The two agree closely for the
states that carry an FIA carbon anchor but diverge sharply elsewhere (for
example MI 0.39, WI 0.55), because the uniform-grid model falls back to a
median area-per-plot where no anchor exists, while TreeMap uses real pixel
area everywhere. The practical conclusion: TreeMap pixel-area expansion is the
more defensible CONUS-wide basis, and the FIADB uniform-grid line should be
read as reliable only for anchored states.

## Files

- `scripts/yield_curve_engine/ycx_hybrid_modelform.R` - hybrid model-form CV + per-cell A*
- `scripts/yield_curve_engine/ycx_products.R` - sawtimber/pulpwood/residue allocation
- `scripts/yield_curve_engine/ycx_fiadb_vs_treemap.R` - expansion comparison (reads CSV)
- `scripts/yield_curve_engine/ycx_extract_series.py` - JSON to tidy CSV for the comparison
- `docs/results/` - pilot CV table, per-cell breakpoints, product summary, comparison CSVs + figure
