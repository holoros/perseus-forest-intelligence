# PERSEUS DST — red-team critique and stress test

Prepared June 22, 2026. An adversarial review of the prototype: where a skeptical expert
audience (Kasey, Ken, Phil, Erin) will push, how serious each issue is, the mitigation,
and what to say if challenged Monday. Pair with the handoff and demo guide.

## Stress-test summary

- Full client pipeline simulated across all 50 state series x default scenarios x all four
  emphasis weightings: 0 crashes, 0 NaN or out-of-range scores (400 score computations).
- Valuation band valid across all 82 ecoregions; multi-model resolution clean across 50/50
  states; AOI polygon resolves by centroid (northern Maine -> ME, L3 5.3.1).
- Graceful degradation confirmed: even with economics entirely absent, scores stay valid
  and the UI shows whatever engines/data exist rather than erroring.
- Surveillance disturbance-agent data present in 7 states; absent states hide the panel.

The software is robust. The exposure is scientific framing and data resolution, not bugs.

## Where the room will push (ranked by severity)

### High severity — address proactively in the demo

1. Resolution vs the "precision forestry" claim. Build-a-run is state-level (precomputed
   series); the AOI report is ecoregion-level. Calling parcel output "precision forestry"
   overstates the current resolution. Mitigation: TreeMap/inventory stand-init is the
   roadmap. Say: "precision forestry is the target architecture; today's resolution is
   ecoregion/state, and the data-agnostic path (TreeMap, uploaded inventory) is how we get
   to stand level."

2. The Cardinal submit is a simulated queue, not a live dispatch. If presented as live it
   will erode trust the moment someone asks. Mitigation: state it plainly and show the real
   proof. Say: "the browser submit animates the flow; the same run-spec really executes on
   Cardinal via fire_testcase.sh, which I can run live."

3. "Multi-model ensemble" conflates structural and parametric spread. The 11 CBM entries
   are largely parameter/scenario variants, not 11 independent models; lumping them inflates
   the apparent ensemble and muddies "agreement." Mitigation: separate structural
   (FVS vs CBM vs CEM) from within-model variants. Say: "the spread today mixes model and
   scenario variants; separating structural from parametric uncertainty is a known next
   step."

### Medium severity — have an answer ready

4. Single-harvest-at-horizon NPV, not Faustmann rotation. A forest economist (Adam) will
   flag that one cut at 2100 understates managed-land value. Mitigation: Faustmann data is
   already in the tool; wire it. Say: "NPV is illustrative and single-rotation; Faustmann
   rotation is the immediate economics upgrade, and we already have the rotation data."

5. Illustrative prices, carbon, ES, discount, and policy/resilience/risk multipliers. Even
   regionalized, the magnitudes are placeholders. Mitigation: clearly labeled; structured to
   swap real CFRU/TMS series and elicited policy effects. Say: "the mechanics are real, the
   magnitudes are placeholders we will replace with your regional data."

6. Two stitched economic bases. Multi-model trajectories come from precomputed state series;
   the dollar economics come from per-L3 yield curves. Different spatial units and methods in
   one view. Mitigation: unify on one basis. Say: "carbon/volume come from the ensemble;
   dollars from the yield curves; unifying the basis is on the list."

7. Scorecard normalization with only two scenarios pins scores to 0 and 100, which looks
   over-confident. Mitigation: more scenarios, or absolute (not min-max) scales. Say:
   "scores are relative within your scenario set; add scenarios for a finer spread."

8. Climate is currently inert (historic approximately RCP) for most engine/management
   combos. Mitigation: noted in the UI; gated on the CEM calibration run.

### Lower severity — acknowledge if raised

9. Sparse coverage: CEM/LANDIS/disturbance exist for roughly 5 to 7 states; most states are
   FVS + CBM + YC. The tool degrades gracefully but the richest demo is Maine.
10. State-level disturbance rates shown for a parcel; resolution caveat as in (1).
11. Raster map overlays misalign with the vector map (projection mismatch); keep raster
    layers off for the demo (documented in the handoff).
12. Valuation band could be read as financial advice; the disclaimer is present, restate it.
13. Operational: ~1 MB bundle on GitHub Pages, venue network dependency. Mitigation: load
    the tool before the meeting, keep a screenshot/PDF backup and a local copy.

## Net read

Nothing here is a reason not to demo. The honest framing is the strength: a working,
stress-tested prototype that is transparent about illustrative magnitudes and current
resolution, with a credible path (real data, Faustmann, climate scaling, stand-level inputs)
to close each gap. With this audience, leading with the caveats earns more credibility than
polishing over them.

## The two sentences to open and close with

Open: "This is a working prototype of the assessment-and-values engine of the forest-health
framework; the magnitudes are illustrative placeholders, the mechanics and the multi-model
machinery are real."

Close: "Every gap you will find, resolution, prices, climate, rotation, is on a roadmap with
your data and your decisions as the inputs; that is what I want from this meeting."
