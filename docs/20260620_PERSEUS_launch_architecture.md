# PERSEUS: Full-Tool Launch Architecture and Pathway

Prepared June 20, 2026. North-star and build plan for taking the PERSEUS decision-support tool from v1 (a live spatial explorer) to a launchable, landowner-facing scenario tool with a freemium model.

## 1. The user and the decision

One user: a forest landowner (or their advisor) planning future management. The decision they are making: given current timber markets, the potential of ecosystem-service revenue, and a changing climate, how should I manage this property over the coming decades, and what are the trade-offs?

Everything in the tool serves that decision. Spatial layers are evidence inside it, not destinations.

### 1a. The north star: precision forestry and localized property valuation

The deeper thesis is precision forestry, the forest analog of precision agriculture. Precision ag manages within-field variation using localized data; precision forestry manages within-landscape variation and, crucially, values a forest property by accounting for what standard appraisal misses: environmental variation and market uncertainty that are not visible from the stand alone.

A property does not exist in isolation. Its long-term value depends on its neighborhood: the health, risk, and resilience of the surrounding forest; what neighboring owners are likely to do (harvest, fragment, conserve); access to mills and markets; and exposure to climate and disturbance (budworm, fire, drought). A few-acre woodlot and a multi-million-acre ownership both sit inside a landscape that shapes their future value.

So the tool should not stop at the drawn AOI. It should project the surrounding hexes (or other units) around the AOI to give localized context, then fold that context into a valuation that is a range, not a point estimate, capturing the environmental and market uncertainty a single appraisal number hides. That is the differentiated value: helping an owner see, and price, the things about their property that are not yet apparent in a rapidly changing world.

Operationalizing it: given an AOI, pull the surrounding hexes within a radius (or the AOI hex plus its neighbors) and summarize (1) HRR stress and resilience of the neighborhood (hrr_hex, in hand), (2) the ownership mix and likely behavior of neighbors (landowner_by_hex, computing on Cardinal), (3) market and yield context for the ecoregion, and (4) climate and disturbance exposure. Then express long-term value as an NPV range across the market (low/base/high) and climate (historic/RCP) scenarios, combined with neighborhood risk, so the owner sees a defensible valuation band rather than a false-precision figure. This is the concrete next build and it is what most directly separates PERSEUS from carbon-and-wildfire incumbents.

## 2. What the tool does (the spine)

A single flow:

1. Place. Drop a pin or draw the property anywhere in CONUS (or upload a stand inventory).
2. Models. Choose which engines to run (FVS, CBM/GCBM, LANDIS, CEM, yield curves), or accept a sensible default ensemble.
3. Assumptions. Set the contrasts that matter to a landowner: management intensity (reserve, baseline, increased, intensive), climate pathway (historic, RCP4.5, RCP8.5), and disturbance regime. Plus a planning horizon.
4. Compare. Contrasting trajectories side by side for carbon, timber volume and value, and ecosystem-service indicators, with cross-model spread shown as the uncertainty.
5. Decide. A plain-language recommendation and trade-off summary tuned to what the owner values (carbon, income, habitat, resilience), plus an exportable plan.

v1 already does much of this at the area level (the AOI report: pick area, multi-model agreement, priority dial, reserve-vs-managed outlook). The launch work promotes this flow to be the whole product and makes model choice and assumptions first-class, owner-facing controls.

## 3. Freemium model

- Free tier (no account): instant results from a precomputed scenario library. The user picks a place and reads the nearest precomputed outcomes for a fixed set of management x climate scenarios. This is essentially today's static tool, repackaged around the landowner decision.
- Subscriber tier (account + subscription): on-demand custom runs. Upload your own inventory or set custom assumptions, run the chosen engines at your exact location through a queued compute job, save analyses, and export landowner-ready reports.

The free tier acquires and educates; the paid tier funds the compute and sustains the service.

### Pricing (recommendation)

Pricing purely as a multiple of compute (the "10x compute + %" idea) is a weak floor: a custom run is cents to a few dollars of compute, so 10x still reads as a few dollars and signals "toy," not "a tool I plan my land with." It also ties revenue to cost rather than to value. Recommended structure:

- Free: precomputed scenarios anywhere. The hook. No login, instant, real.
- Pro subscription (flat monthly or annual): unlimited standard on-demand runs, saved analyses, landowner-ready exports. Predictable, sticky, and where the habit and most revenue live. Distinct value = run your land, your assumptions, across models.
- Metered credits for heavy custom runs (large AOIs, full ensemble, user-supplied inventory): priced at compute cost times a markup. The 10x multiple is a reasonable markup here, applied only to overage, so power users cover their own load.
- A future B2B / consultant tier (per-seat or revenue share) is where a percentage fee belongs, not the base.

Net: lure with free, hook with a flat Pro tier, and use the compute multiple only as a guardrail on heavy usage.

## 4. Architecture

Five components:

1. Front end (existing static React app, GitHub Pages). Adds: account/login, the scenario panel (place + models + assumptions), free-tier reads from the precompute store, subscriber-tier posts a run request and polls for results.
2. Precompute store. The static JSON and raster library already served on Pages, extended to a denser precomputed factorial so the free tier answers "any place, common scenarios" instantly.
3. Run service (new backend API). Endpoints: POST /run (validate the run-spec, check entitlement, enqueue), GET /run/{id} (status), GET /run/{id}/result. A worker translates each run-spec into a compute job and ingests results.
4. Compute broker to OSC Cardinal. Submits SLURM jobs that run the selected engines for the area under each assumption combination and return trajectories plus uncertainty. Reuses the existing engine code (FVS modern, CBM/GCBM, CEM, LANDIS, yield curves).
5. Accounts, entitlements, and billing. Account sign-in and tier gating. Billing through a standard provider. Note: payment and credential handling will be set up by the team with a provider; this scaffold defines the tier flags and the entitlement check, not the payment flow.

Data contract (the key artifact): a run-spec JSON that the front end posts and the Cardinal runner consumes. See run_spec.schema.json in the scaffold. It carries the AOI, the chosen models, the assumption matrix (management x climate x disturbance x horizon), the requested outputs, the tier, and the user.

Hosting: the front end stays static on Pages. The run service needs a small always-on server (an institutional VM, a cloud instance, or an OSC OnDemand-hosted app) that can reach Cardinal to submit jobs.

## 5. From v1 to launch (phased)

- Phase A, repackage (front end, no new science). Make place-first the front door; fold the current tabs into a context drawer; promote the AOI flow with explicit model and assumption controls; tier-gate custom controls behind a (stub) account.
- Phase B, precompute store for the free tier. Build a denser precomputed factorial (management x climate) queryable at any point, so the free tier is instant and useful. (The landowner ownership-by-unit work and HRR grid are early pieces of this store.)
- Phase C, run service plus Cardinal broker. Stand up the backend API and the worker that turns a run-spec into a SLURM job and returns results. This is the core new infrastructure and the main effort.
- Phase D, accounts and billing. Add sign-in, entitlements, and subscription (provider-dependent; team to configure payment).
- Phase E, landowner reporting and polish. Owner-ready exportable plans, saved analyses, onboarding, and pricing.

## 6. Decisions still needed

1. Hosting for the run service (institutional VM vs cloud vs OSC OnDemand app) and the data store for results and user workspaces.
2. Account and billing provider, and the free-versus-paid feature line (what exactly is gated).
3. Compute budget and quotas per subscriber (Cardinal allocation vs a dedicated allocation), and the queue and timeout policy for on-demand runs.
4. The default ensemble and the default assumptions a free user sees first.
5. Which ecosystem-service indicators are in v1 of the landowner outputs.

## 7. What is being scaffolded now

The foundational, reviewable infrastructure (in the run-service scaffold): the run-spec schema (the front-end-to-compute contract), a backend API skeleton (FastAPI) with the run/status/result endpoints and an entitlement stub, a Cardinal dispatch stub (run-spec to SLURM), and a Cardinal scenario-runner job template. None of this is deployed or billable; it is the skeleton the team reviews and fills in.
