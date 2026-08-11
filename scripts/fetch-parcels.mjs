/**
 * Fetch the labelled Rock Island County working subset from the live county ArcGIS
 * FeatureServer and write it, plus a provenance/scope metadata file, into public/data/.
 *
 * Run by hand, from the repo root:
 *
 *   node scripts/fetch-parcels.mjs
 *
 * Deliberately NOT wired to `npm run build`: a build-time fetch would make every
 * production deploy depend on the county service being up.
 *
 * The script never mutates, defaults, cleans or drops a field value. Dirty source
 * strings pass through verbatim.
 */

import { mkdir, writeFile } from "node:fs/promises";

const LAYER =
  "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0";
const BBOX = "-90.58,41.49,-90.54,41.52";
const FIELDS = "PIN,owner1_name,taxbill_name,EAV,EMV,taxbill_addr,taxbill_csz,GIS_acres_num";
const PAGE = 2000;

const OUT_DIR = new URL("../public/data/", import.meta.url);
const OUT_DATA = new URL("rock-island-parcels.json", OUT_DIR);
const OUT_META = new URL("rock-island-parcels.meta.json", OUT_DIR);

const EXPECTED_COUNT = 6026;
const COUNT_TOLERANCE = 50;

/** @param {number} offset */
function pageUrl(offset) {
  const params = new URLSearchParams({
    geometry: BBOX,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
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
  const nullGeometries = features.filter((f) => f.geometry === null || f.geometry === undefined);
  if (nullGeometries.length > 0) {
    throw new Error(`${nullGeometries.length} features have null geometry`);
  }
  const seen = new Set();
  const duplicates = [];
  for (const f of features) {
    const pin = f.properties?.PIN;
    if (pin === "UNKNOWN") continue;
    if (seen.has(pin)) duplicates.push(pin);
    seen.add(pin);
  }
  if (duplicates.length > 0) {
    throw new Error(`duplicate PINs (excluding "UNKNOWN"): ${duplicates.join(", ")}`);
  }

  const fields = FIELDS.split(",");
  const incompletePins = features
    .filter((f) => fields.some((name) => isBlank(f.properties?.[name])))
    .map((f) => f.properties?.PIN)
    .sort();

  const featureCollection = { type: "FeatureCollection", features };
  const dataJson = JSON.stringify(featureCollection);

  const meta = {
    county: "rock-island",
    countyName: "Rock Island County, IL",
    sourceLayerUrl: LAYER,
    sourceOrg: "Rock Island County GIS",
    sourceItemId: "9cae8a64ab0e4cea99758f741ca43b3c",
    sourceLicense: "For use by the general public",
    retrievedAt: new Date().toISOString(),
    bbox: BBOX.split(",").map(Number),
    bboxLabel: "90.5800°W–90.5400°W, 41.4900°N–41.5200°N",
    areaLabel: "≈3.3 km × 3.3 km over the City of Rock Island, IL",
    spatialRel: "esriSpatialRelIntersects",
    parcelCount: features.length,
    countyParcelCount,
    fields,
    incompletePins,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_DATA, dataJson);
  await writeFile(OUT_META, JSON.stringify(meta, null, 2) + "\n");

  console.log(`features:           ${features.length}`);
  console.log(`bytes:              ${Buffer.byteLength(dataJson)}`);
  console.log(`countyParcelCount:  ${countyParcelCount}`);
  console.log(`incompletePins:     ${JSON.stringify(incompletePins)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
