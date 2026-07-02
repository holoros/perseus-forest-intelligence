# Security Policy

## Reporting a vulnerability

PERSEUS Forest Intelligence is a static research visualization app with no
authentication and no server-side state. Nearly all data (JSON and PNG/JPG
assets) is fetched from the same origin (the GitHub Pages bundle). The one
exception is the optional "Forest near me" button: if the user declines
browser geolocation, the app makes a single client-side request to the
third-party service `ipapi.co` for an approximate location by IP. No user
data is sent beyond the request itself, and no location is stored. The
Content-Security-Policy in `index.html` restricts network `connect-src` to
the same origin plus `ipapi.co`.

If you find a security issue, please email Aaron Weiskittel directly at
**aaron.weiskittel@maine.edu** with a clear description and reproduction
steps. Please do **not** open a public issue for security topics.

A response will follow within a week. If the issue is exploitable, we
will work with you on a coordinated disclosure timeline.

## What's not in scope

* The underlying data products (perseus_db schema, FIA / LANDIS /
  TreeMap / LCMS / GEDI inputs) are the responsibility of their
  upstream maintainers.
* Browser bugs unrelated to our code.
* The Cardinal HPC pipeline that generates public/api/ and
  public/raster/. That work runs in a separate non-public infrastructure.

## Supported versions

Active development and deployment both track the `main` branch. Every push
to `main` is built and published to GitHub Pages by
`.github/workflows/deploy-pages.yml` (Pages Source: GitHub Actions), so the
deployed app and the `main` source are in sync. The current app version is
recorded in `index.html` (`<meta name="app-version">`). The historical
`v0.73-source` / `v1.3-deployed` source-vs-deploy split has been reconciled
and no longer applies.
