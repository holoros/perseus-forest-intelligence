# Raster overlay storage

## Why

`public/raster/` holds 107 PNG map overlays totalling about 131 MB (137,512,863 bytes), alongside 65 small JSON bounds sidecars. PNGs are already compressed, so git cannot delta them against earlier versions: every regenerated overlay adds its full size to history, and the packed history for these files alone is about 191 MB. Every clone and every CI checkout pays that cost, and it grows with each data refresh. The sidecars are tiny, change rarely, and stay in git.

## Options considered

Object storage with a manifest in git is the recommended option. The PNGs live in a bucket (S3, R2, GCS or similar) behind a public HTTPS URL, and `public/raster/manifest.json` records the path, byte size, sha256 and pixel dimensions of every file. The manifest is small, diffs cleanly, and lets CI verify that the deployed set matches what the code expects. Clones stay small and the deploy only needs the base URL.

GitHub release assets would keep everything on GitHub without a new account, but assets are attached to a release rather than to a commit, have no stable directory layout, are awkward to update file by file, and serve through redirects that complicate CORS for the canvas sampling code. They suit a frozen data bundle better than a working overlay set.

Git LFS keeps the familiar git workflow, but LFS bandwidth is metered on GitHub, and every CI checkout with `lfs: true` downloads the full 131 MB working set. With build checks on every push and PR plus the Pages deploy, that quota would be consumed quickly, and LFS adds a tool every contributor must install. It also does not shrink existing history.

## What this branch does

Nothing moves yet. `scripts/build_raster_manifest.py` writes the manifest and `--check` exits 1 if it disagrees with the files on disk. Every front end PNG URL now goes through `rasterUrl()` in `src/rasterBase.js`. When `VITE_RASTER_BASE` is unset the URL is `${BASE_URL}raster/<name>` exactly as before; when it is set at build time to an absolute URL ending in `/`, PNGs load from that base instead. Bounds JSON is still fetched from the repo copy.

## Content Security Policy

The CSP meta tag in `index.html` currently sets `img-src 'self' data: blob:`, which would block a bucket host. When the bucket exists, add its origin to `img-src`, so the directive reads `img-src 'self' data: blob: https://<bucket-host>`. The SVG map overlays and the AOI sampling code (`src/rasterSample.js`, which loads through `new Image()`) are governed by `img-src`. The MapLibre path loads image sources with `fetch`, which falls under `connect-src`, so that directive should become `connect-src 'self' data: blob: https://ipapi.co https://<bucket-host>`. The bucket must also send `Access-Control-Allow-Origin` for the site origin (or `*`), because the sampling code sets `crossOrigin = "anonymous"` and reads pixels back from a canvas, which fails on a tainted canvas.

## Migration steps once a bucket exists

First, upload the contents of `public/raster/*.png` to the bucket preserving relative paths, with CORS configured as above and a long cache lifetime. Second, set `VITE_RASTER_BASE=https://<bucket-host>/<prefix>/` in the build step of the deploy workflow, and record the same value as `base_url` with `python3 scripts/build_raster_manifest.py --base-url ...`. Third, make the CSP change described above in the same PR. Fourth, run `python3 scripts/build_raster_manifest.py --check` and spot check a few overlays against the deployed site, comparing hashes of downloaded bucket objects with the manifest. Only after that deploy is confirmed working, remove the PNGs from the tree in a separate PR, at which point the `--check` step in CI must switch to verifying the bucket against the manifest rather than the working tree.

## History

Removing the PNGs from the tree stops further growth but does not reclaim the roughly 191 MB already in history. Reclaiming it requires rewriting history with `git filter-repo`, which changes every commit SHA, invalidates open PRs and existing clones, and needs a coordinated force push. That is a separate decision and is not part of this migration.
