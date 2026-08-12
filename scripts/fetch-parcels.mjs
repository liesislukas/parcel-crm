/**
 * Fetch every Rock Island County parcel record from the live county ArcGIS FeatureServer
 * and write the four artifacts the app is built from, into public/data/:
 *
 *   rock-island-parcels.tiles.geojsonl   tile input, one Feature per line (gitignored)
 *   rock-island-parcels.attrs.json       columnar attributes sidecar, all 65,955 records
 *   rock-island-parcels.adjacency.json   precomputed neighbour row indices
 *   rock-island-parcels.meta.json        provenance and scope
 *
 * Run by hand, from the repo root:
 *
 *   node scripts/fetch-parcels.mjs
 *   ./scripts/build-parcel-tiles.sh
 *
 * The second step turns the .geojsonl into the committed .pmtiles with, verbatim:
 *
 *   tippecanoe \
 *     -o public/data/rock-island-parcels.pmtiles \
 *     -l parcels \
 *     -Z8 -z16 \
 *     --no-tile-size-limit \
 *     --no-feature-limit \
 *     --no-tiny-polygon-reduction \
 *     --preserve-input-order \
 *     --force \
 *     public/data/rock-island-parcels.tiles.geojsonl
 *
 * Deliberately NOT wired to `npm run build`: a build-time fetch would make every
 * production deploy depend on the county service being up.
 *
 * The script never mutates, defaults, cleans or drops a field value. Dirty source
 * strings pass through verbatim.
 */

import { mkdir, writeFile, stat } from "node:fs/promises";

const LAYER =
  "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0";
const FIELDS =
  "OBJECTID,PIN,owner1_name,taxbill_name,EAV,EMV,taxbill_addr,taxbill_csz,GIS_acres_num";
/** The eight source fields. OBJECTID is identity, not a source attribute, so it is not listed. */
const SOURCE_FIELDS = [
  "PIN",
  "owner1_name",
  "taxbill_name",
  "EAV",
  "EMV",
  "taxbill_addr",
  "taxbill_csz",
  "GIS_acres_num",
];
const PAGE = 2000;

const OUT_DIR = new URL("../public/data/", import.meta.url);
const OUT_TILES = new URL("rock-island-parcels.tiles.geojsonl", OUT_DIR);
const OUT_ATTRS = new URL("rock-island-parcels.attrs.json", OUT_DIR);
const OUT_ADJACENCY = new URL("rock-island-parcels.adjacency.json", OUT_DIR);
const OUT_META = new URL("rock-island-parcels.meta.json", OUT_DIR);

const EXPECTED_COUNT = 65955;
const COUNT_TOLERANCE = 200;

/** @param {number} offset */
function pageUrl(offset) {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: FIELDS,
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    orderByFields: "OBJECTID ASC",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    f: "geojson",
  });
  return `${LAYER}/query?${params}`;
}

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  const body = await res.json();
  if (body && body.error) throw new Error(`ArcGIS error: ${JSON.stringify(body.error)}`);
  return body;
}

/** Blank means null, undefined, or a string that is empty once trimmed. Numeric 0 is NOT blank. */
function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

/**
 * True when the geometry carries at least one non-empty outer ring. Two county records
 * (PIN 1710408032 and 1710408043) publish `{"type":"Polygon","coordinates":[[]]}` — real
 * ownership and value data, no outline. They are kept as records and excluded from tiles.
 */
function hasGeometry(g) {
  if (!g) return false;
  if (g.type === "Polygon") {
    return Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0]) && g.coordinates[0].length > 0;
  }
  if (g.type === "MultiPolygon") {
    return (
      Array.isArray(g.coordinates) &&
      g.coordinates.some((part) => Array.isArray(part) && Array.isArray(part[0]) && part[0].length > 0)
    );
  }
  return false;
}

/** Shoelace centroid of one closed ring. Mirrors `ringCentroid` in src/lib/geo.ts. */
function ringCentroid(ring) {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const cross = xi * yj - xj * yi;
    a2 += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  const area = a2 / 2;
  if (area === 0) return { lng: ring[0][0], lat: ring[0][1] };
  return { lng: cx / (6 * area), lat: cy / (6 * area) };
}

/**
 * The parcel's centre point. Mirrors `polygonCentroid` in src/lib/geo.ts byte-for-byte in
 * behaviour: for a MultiPolygon the outer ring with the most vertices wins.
 */
function polygonCentroid(geometry) {
  if (geometry.type === "Polygon") return ringCentroid(geometry.coordinates[0]);
  if (geometry.type === "MultiPolygon") {
    let largest = null;
    for (const polygon of geometry.coordinates) {
      const outer = polygon[0];
      if (!Array.isArray(outer) || outer.length === 0) continue;
      if (largest === null || outer.length > largest.length) largest = outer;
    }
    if (largest === null) throw new Error("unsupported geometry: empty MultiPolygon");
    return ringCentroid(largest);
  }
  throw new Error("unsupported geometry: " + geometry.type);
}

/** Rings contributing boundary segments. Mirrors `ringsOf` in src/lib/adjacency.ts. */
function ringsOf(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

/** Undirected segment key at the source's 6-decimal precision. Mirrors src/lib/adjacency.ts. */
function segmentKey(p1, p2) {
  const a = p1[0].toFixed(6) + "," + p1[1].toFixed(6);
  const b = p2[0].toFixed(6) + "," + p2[1].toFixed(6);
  if (a === b) return null;
  return a < b ? a + "|" + b : b + "|" + a;
}

/**
 * Adjacent = the two outlines share at least one identical boundary segment at 6 decimals.
 * A shared corner is not adjacency. Same algorithm as src/lib/adjacency.ts used to run in
 * the browser; it now runs here once, keyed by row index rather than by parcel id, because
 * row indices are what the committed adjacency file stores.
 *
 * @param {{ rowIndex: number, geometry: object }[]} mapped
 * @param {number} rowCount
 * @returns {number[][]} element i = neighbour row indices of row i, ascending
 */
function buildAdjacencyRows(mapped, rowCount) {
  const segmentOwners = new Map();

  for (const record of mapped) {
    for (const ring of ringsOf(record.geometry)) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const key = segmentKey(ring[i], ring[i + 1]);
        if (key === null) continue;
        let owners = segmentOwners.get(key);
        if (!owners) {
          owners = new Set();
          segmentOwners.set(key, owners);
        }
        owners.add(record.rowIndex);
      }
    }
  }

  /** @type {Set<number>[]} */
  const neighbours = Array.from({ length: rowCount }, () => new Set());
  for (const owners of segmentOwners.values()) {
    if (owners.size < 2) continue;
    const rows = [...owners];
    for (const row of rows) {
      for (const other of rows) {
        if (other !== row) neighbours[row].add(other);
      }
    }
  }

  return neighbours.map((set) => [...set].sort((a, b) => a - b));
}

/** 32-bit FNV-1a. One implementation, shared with src/lib/owners.ts. */
function fnv1a32(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Stable key for a parcel outline, used to collapse condo/PUD records filed against one
 * physical outline. Verified collision-free across all 64,279 distinct county footprints.
 */
function footprintKey(geometry) {
  return fnv1a32(JSON.stringify(geometry.coordinates)).toString(16);
}

async function byteSize(url) {
  const s = await stat(url);
  return s.size;
}

async function main() {
  // The live county total, queried rather than hardcoded, so it is provably live.
  const countTotal = await getJson(`${LAYER}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const countyParcelCount = countTotal.count;
  if (!Number.isFinite(countyParcelCount)) {
    throw new Error(`no county count in response: ${JSON.stringify(countTotal)}`);
  }

  const features = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await getJson(pageUrl(offset));
    const got = Array.isArray(page.features) ? page.features : [];
    console.log(`page offset=${offset} features=${got.length}`);
    features.push(...got);
    if (got.length < PAGE) break;
  }

  // Assertions — fail loudly rather than commit a wrong file.
  if (Math.abs(features.length - EXPECTED_COUNT) > COUNT_TOLERANCE) {
    throw new Error(
      `feature count ${features.length} is outside ${EXPECTED_COUNT} +/- ${COUNT_TOLERANCE}`,
    );
  }
  const missingObjectId = features.filter((f) => !Number.isFinite(f.properties?.OBJECTID));
  if (missingObjectId.length > 0) {
    throw new Error(`${missingObjectId.length} features have no OBJECTID`);
  }
  const objectIds = new Set(features.map((f) => f.properties.OBJECTID));
  if (objectIds.size !== features.length) {
    throw new Error(
      `OBJECTID is not distinct: ${objectIds.size} distinct values over ${features.length} records`,
    );
  }

  // PIN is NOT unique county-wide — 65,813 distinct values over 65,955 records, "USA" alone
  // appearing 87 times. That is real source data, not corruption, so it is reported and never
  // thrown on. Identity is OBJECTID; PIN is a display and export field.
  const pinCounts = new Map();
  for (const f of features) {
    const pin = f.properties?.PIN;
    pinCounts.set(pin, (pinCounts.get(pin) ?? 0) + 1);
  }
  const duplicatePins = [...pinCounts.entries()].filter(([, n]) => n > 1);
  const duplicateRecords = duplicatePins.reduce((sum, [, n]) => sum + n, 0);
  console.log(
    `duplicate PIN values: ${duplicatePins.length} covering ${duplicateRecords} records ` +
      `(${pinCounts.size} distinct PINs over ${features.length} records) — identity is OBJECTID`,
  );

  const columns = [
    "id",
    "PIN",
    "owner1_name",
    "taxbill_name",
    "EAV",
    "EMV",
    "taxbill_addr",
    "taxbill_csz",
    "GIS_acres_num",
    "lng",
    "lat",
    "fp",
  ];

  const rows = [];
  const tileLines = [];
  const mapped = [];
  const unmappedPins = [];
  const incompletePins = [];
  const owners = new Set();
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  features.forEach((f, rowIndex) => {
    const p = f.properties;
    const geometry = f.geometry;
    const mappable = hasGeometry(geometry);

    let lng = null;
    let lat = null;
    let fp = null;
    if (mappable) {
      const c = polygonCentroid(geometry);
      lng = Number(c.lng.toFixed(6));
      lat = Number(c.lat.toFixed(6));
      fp = footprintKey(geometry);
      mapped.push({ rowIndex, geometry });
      tileLines.push(
        JSON.stringify({
          type: "Feature",
          geometry,
          properties: { id: p.OBJECTID, PIN: p.PIN },
        }),
      );
      for (const ring of ringsOf(geometry)) {
        for (const point of ring) {
          if (point[0] < west) west = point[0];
          if (point[0] > east) east = point[0];
          if (point[1] < south) south = point[1];
          if (point[1] > north) north = point[1];
        }
      }
    } else {
      unmappedPins.push(String(p.PIN));
    }

    rows.push([
      p.OBJECTID,
      p.PIN,
      p.owner1_name,
      p.taxbill_name,
      p.EAV,
      p.EMV,
      p.taxbill_addr,
      p.taxbill_csz,
      p.GIS_acres_num,
      lng,
      lat,
      fp,
    ]);

    if (SOURCE_FIELDS.some((name) => isBlank(p[name]))) incompletePins.push(String(p.PIN));
    if (!isBlank(p.owner1_name)) owners.add(String(p.owner1_name).trim());
  });

  unmappedPins.sort();
  incompletePins.sort();

  const adjacencyRows = buildAdjacencyRows(mapped, rows.length);
  const adjacencyPairs = adjacencyRows.reduce((sum, list) => sum + list.length, 0) / 2;
  const withNeighbour = adjacencyRows.filter((list) => list.length > 0).length;

  const bbox = [west, south, east, north];
  const bboxLabel =
    `${Math.abs(west).toFixed(4)}°W–${Math.abs(east).toFixed(4)}°W, ` +
    `${south.toFixed(4)}°N–${north.toFixed(4)}°N`;

  const meta = {
    county: "rock-island",
    countyName: "Rock Island County, IL",
    sourceLayerUrl: LAYER,
    sourceOrg: "Rock Island County GIS",
    sourceItemId: "9cae8a64ab0e4cea99758f741ca43b3c",
    sourceLicense: "For use by the general public",
    retrievedAt: new Date().toISOString(),
    coverage: "full-county",
    bbox,
    bboxLabel,
    areaLabel: "the full extent of Rock Island County, IL",
    parcelCount: rows.length,
    countyParcelCount,
    mappedParcelCount: mapped.length,
    unmappedPins,
    fields: SOURCE_FIELDS,
    incompletePins,
    tiles: {
      path: "/data/rock-island-parcels.pmtiles",
      layer: "parcels",
      minzoom: 8,
      maxzoom: 16,
      idProperty: "id",
    },
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_TILES, tileLines.join("\n") + "\n");
  await writeFile(OUT_ATTRS, JSON.stringify({ columns, rows }));
  await writeFile(OUT_ADJACENCY, JSON.stringify(adjacencyRows));
  await writeFile(OUT_META, JSON.stringify(meta, null, 2) + "\n");

  console.log(`records:            ${rows.length}`);
  console.log(`mappable:           ${mapped.length}`);
  console.log(`unmapped:           ${JSON.stringify(unmappedPins)}`);
  console.log(`distinct owners:    ${owners.size}`);
  console.log(`incomplete:         ${incompletePins.length}`);
  console.log(`adjacency pairs:    ${adjacencyPairs}`);
  console.log(`with a neighbour:   ${withNeighbour}`);
  console.log(`countyParcelCount:  ${countyParcelCount}`);
  console.log(`bbox:               ${bbox.join(", ")}`);
  console.log(`tiles.geojsonl:     ${await byteSize(OUT_TILES)} bytes`);
  console.log(`attrs.json:         ${await byteSize(OUT_ATTRS)} bytes`);
  console.log(`adjacency.json:     ${await byteSize(OUT_ADJACENCY)} bytes`);
  console.log(`meta.json:          ${await byteSize(OUT_META)} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
