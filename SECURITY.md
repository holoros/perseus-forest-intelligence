# Security Policy

## Reporting a vulnerability

PERSEUS Forest Intelligence is a static research visualization app with no
authentication and no server-side state. It does fetch JSON and PNG/JPG
assets from the same origin (the gh-pages bundle).

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

Active development is on the main branch; the deployed app on
gh-pages (currently v1.3) is the only supported version. The
v0.73-source and v1.3-deployed tags anchor the current
source-vs-deploy split.
