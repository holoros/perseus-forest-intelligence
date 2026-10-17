// Single source for raster overlay PNG URLs. By default PNGs are served from
// the repo copy at `${BASE_URL}raster/`. Setting VITE_RASTER_BASE at build time
// (an absolute URL ending in "/") points them at object storage instead; see
// docs/raster_storage.md. Bounds JSON sidecars stay in the repo and are not
// routed through here.
const RASTER_BASE = import.meta.env.VITE_RASTER_BASE || `${import.meta.env.BASE_URL}raster/`;

export function rasterUrl(name){ return RASTER_BASE + name; }
