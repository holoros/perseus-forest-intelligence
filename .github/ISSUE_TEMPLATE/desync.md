---
name: Source/deploy desync work
about: Reconcile main source with gh-pages v1.3 deployed features
title: "[desync] "
labels: desync
---

## Which v1.3 feature

* [ ] Upload AOI button
* [ ] Inspect point (click-to-query)
* [ ] ycx year-slider animation
* [ ] CSPI v3 reference figure
* [ ] Other (describe)

## Plan

1. Extract the feature from the deployed bundle (or the canonical source if you have it locally)
2. Land it on a feature branch off main
3. Open a PR that documents the deployed-vs-source diff this commit closes
4. After merge, when ALL v1.3 features are reconciled, flip `.github/workflows/deploy-pages.yml` trigger back to `push: branches: [main]` and tag a `v1.4-source` release matching the new main
