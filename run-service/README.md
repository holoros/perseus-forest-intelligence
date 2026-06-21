# PERSEUS run-service (scaffold)

Foundational infrastructure for the PERSEUS landowner scenario tool: the contract
and skeletons that turn "pick a place, choose models and assumptions" into an
on-demand compute run, with a free precomputed tier and a paid on-demand tier.

This is a reviewable skeleton. Nothing here is deployed, billed, or runs jobs yet.

## Pieces

- `run_spec.schema.json` — the contract. The front end posts a run-spec; the
  Cardinal runner consumes it. AOI x models x assumptions (management x climate x
  disturbance x horizon) x requested outputs x tier x user.
- `backend/app.py` — FastAPI skeleton: `POST /run`, `GET /run/{id}`,
  `GET /run/{id}/result`. Free tier resolves against the precompute store;
  subscriber tier enqueues an on-demand Cardinal run. Entitlement is a stub.
- `backend/cardinal_dispatch.py` — translates a run-spec to a Cardinal SLURM job
  and tracks/fetches it (SSH/SLURM calls outlined, not live).
- `cardinal/run_scenario.py` + `cardinal/submit_scenario.slurm` — the runner that
  expands the assumption cross-product and runs the selected engines for the AOI.
  Engine calls dispatch to the existing PERSEUS engines (FVS, CBM/GCBM, CEM,
  LANDIS, yield) — to be filled in.

## Tiers

- Free (no account): instant results from the static precompute store (the
  current tool's JSON/raster library), for a fixed scenario set at any place.
- Subscriber (account + subscription): on-demand custom runs, saved analyses,
  landowner-ready exports.

## What the team still decides (see the launch-architecture memo)

- Run-service hosting (institutional VM / cloud / OSC OnDemand) and the results
  + user-workspace store.
- Account + billing provider and the exact free-vs-paid feature line. (Payment and
  credential handling are configured by the team, not in this scaffold.)
- Per-subscriber compute quota and the queue/timeout policy on Cardinal.

## Status

The on-demand pipeline is proven end to end on Cardinal with the yield engine:
a run-spec (point in Maine, reserve vs baseline x historic vs RCP4.5) resolves the
AOI to its L3 ecoregion (8.1.8), runs the per-L3 yield-curve lookup, and writes
`result.json` with real trajectories (reserve 52.4 vs baseline 38.7 ton/ac AGB at
2100). See `cardinal/example_result.json`.

Forward market scenarios are wired: a `markets` block (price_scenario low/base/high,
carbon price, discount rate) drives economic outputs from the yield curves. See
`cardinal/example_result_markets.json`.

Multi-model engines are now REAL, not stubs. The runner resolves the AOI to its state
and ecoregion, then returns the actual precomputed PERSEUS model trajectories (FVS,
CBM/libcbm, CEM, yield) by state x management x metric, plus the yield-curve economics.
A single on-demand spec for a Maine point returns FVS (3 models), CBM (1 to 11), CEM
(7), and yield (3 to 7) ensembles. See `cardinal/example_result_multimodel.json`.

Fire a test case live (any CONUS point):
  ~/perseus_run/fire_testcase.sh <lon> <lat> [run_id]
e.g. `fire_testcase.sh -69.0 45.2` (Maine) or `fire_testcase.sh -83.0 35.5` (NC).

Next fronts: surfacing the multi-model ensemble in the browser Scenario runner,
LANDIS coverage, climate handling, the surrounding-hex valuation, and policy
constraints.

## Build order

1. DONE (yield): the runner reads a spec, resolves AOI -> L3, and returns real
   yield-curve trajectories. Next, wire the heavier engines (FVS, CBM, CEM,
   LANDIS) into `run_scenario.py`, and add climate scaling via per-L3 RCP curves.
2. Wire `cardinal_dispatch` SSH/SLURM calls (stage spec, sbatch, poll, fetch).
3. Stand up the backend on a small always-on host that can reach Cardinal.
4. Add the front-end scenario panel (place + models + assumptions) and the
   precompute store query for the free tier.
5. Add accounts, entitlements, and subscription.
