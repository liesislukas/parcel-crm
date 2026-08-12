#!/usr/bin/env bash
# Build the committed Rock Island County vector tiles from the extract written by
# scripts/fetch-parcels.mjs. Run by hand from the repo root, after the fetch:
#
#   node scripts/fetch-parcels.mjs && ./scripts/build-parcel-tiles.sh
#
# Requires tippecanoe (v2.79.0 here, `brew install tippecanoe`). This is documentation as
# code: the artifact is committed, so tippecanoe is NEVER run in CI and NEVER run on Vercel.
#
# Measured over the full county (65,953 mappable parcels, 818,376 vertices):
#   output size                       15.80 MB
#   distinct ids resolvable at z10    65,911 of 65,953 = 99.94%   (county fits the viewport here)
#   distinct ids resolvable at z12+   65,952 of 65,953 = 100.00%
#
# Every flag is load-bearing:
#   -l parcels                      fixes the source-layer name the map style depends on
#   -Z8                             below the ~z10.8 county-fit zoom, so parcels draw at county view
#   -z16                            deepest stored zoom; MapLibre overzooms past it for free
#   --no-tile-size-limit            stops features being dropped to hit the 500 KB tile budget
#   --no-feature-limit              same, for the per-tile feature count
#   --no-tiny-polygon-reduction     keeps z10 id retention at 99.94% instead of 99.76%
#   --preserve-input-order          keeps OBJECTID ASC order
set -euo pipefail

tippecanoe \
  -o public/data/rock-island-parcels.pmtiles \
  -l parcels \
  -Z8 -z16 \
  --no-tile-size-limit \
  --no-feature-limit \
  --no-tiny-polygon-reduction \
  --preserve-input-order \
  --force \
  public/data/rock-island-parcels.tiles.geojsonl
