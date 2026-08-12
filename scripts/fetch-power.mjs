/**
 * Fetch the OpenStreetMap power-infrastructure snapshot for Rock Island County (substations
 * and transmission lines) via the Overpass API, cross-check the transmission-line count
 * against HIFLD Open, verify no public federal substations layer exists, and write a
 * committed GeoJSON snapshot plus a provenance metadata file into public/data/.
 *
 * Run by hand, from the repo root:
 *
 *   node scripts/fetch-power.mjs
 *
 * Deliberately NOT wired to `npm run build`, `predev`, `prebuild` or CI: a build-time fetch
 * would make every production deploy depend on Overpass being up. The deployed runtime never
 * calls Overpass, ArcGIS or any other third party — the snapshot ships as a static asset.
 *
 * The script never mutates, defaults, cleans or invents a field value. A tag OSM does not
 * carry is written as `null`, never `""` and never a guess.
 */

import { mkdir, writeFile } from "node:fs/promises";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const BBOX_WSEN = [-91.0721, 41.3268, -90.1599, 41.783];
const BBOX_OVERPASS = "41.3268,-91.0721,41.7830,-90.1599"; // (south,west,north,east)
const HIFLD_TL_LAYER =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0";
const HIFLD_ORG_SERVICES =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services?f=json";

const OUT_DIR = new URL("../public/data/", import.meta.url);
const OUT_DATA = new URL("rock-island-power.json", OUT_DIR);
const OUT_META = new URL("rock-island-power.meta.json", OUT_DIR);

const SUBSTATION_QUERY = `[out:json][timeout:180];( node["power"="substation"](${BBOX_OVERPASS}); way["power"="substation"](${BBOX_OVERPASS}); relation["power"="substation"](${BBOX_OVERPASS}); ); out center tags;`;
const LINE_QUERY = `[out:json][timeout:180];( way["power"="line"](${BBOX_OVERPASS}); ); out geom tags;`;

const SUBSTATION_MIN = 80;
const SUBSTATION_MAX = 5000;
const LINE_MIN = 240;
const LINE_MAX = 5000;

// Overpass's Apache front-end answers HTTP 406 to requests with no `User-Agent` header —
// Node's global `fetch` sends none by default. Not documented in the plan; discovered by
// running this script. A descriptive UA identifying the script is sent so Overpass can see
// who is calling it, per https://wiki.openstreetmap.org/wiki/Overpass_API#Introduction.
const FETCH_HEADERS_FORM = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "parcel-crm-fetch-power/1.0 (+https://github.com/prismteam-ai/parcel-crm)",
  Accept: "*/*",
};

/** Round to 6 decimal places, matching geometryPrecision "6" in scripts/fetch-parcels.mjs. */
function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * POST to the Overpass API. Retries up to 3 attempts total on HTTP 429 or 504, waiting
 * 30,000 ms between attempts. Any other non-OK status throws immediately.
 *
 * @param {string} query
 */
async function postOverpass(query) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: FETCH_HEADERS_FORM,
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 504) && attempt < 3) {
      lastErr = new Error(
        `HTTP ${res.status} ${res.statusText} from Overpass (attempt ${attempt})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      continue;
    }
    throw new Error(`HTTP ${res.status} ${res.statusText} from Overpass`);
  }
  throw lastErr;
}

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "parcel-crm-fetch-power/1.0 (+https://github.com/prismteam-ai/parcel-crm)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** `"<type>/<id>"`, e.g. "way/253858380". */
function osmId(el) {
  return `${el.type}/${el.id}`;
}

function osmUrl(id) {
  return "https://www.openstreetmap.org/" + id;
}

/** null when the tag is absent — never "", never "unknown", never guessed. */
function tag(el, key) {
  const v = el.tags?.[key];
  return v === undefined ? null : v;
}

/** @param {any} el */
function substationFeature(el) {
  const id = osmId(el);
  const center = el.center ?? { lat: el.lat, lon: el.lon };
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [round6(center.lon), round6(center.lat)] },
    properties: {
      kind: "substation",
      osmId: id,
      osmUrl: osmUrl(id),
      name: tag(el, "name"),
      operator: tag(el, "operator"),
      voltage: tag(el, "voltage"),
      substationType: tag(el, "substation"),
      cables: null,
    },
  };
}

/** @param {any} el */
function lineFeature(el) {
  const id = osmId(el);
  return {
    type: "Feature",
    id,
    geometry: {
      type: "LineString",
      coordinates: (el.geometry ?? []).map((p) => [round6(p.lon), round6(p.lat)]),
    },
    properties: {
      kind: "transmission-line",
      osmId: id,
      osmUrl: osmUrl(id),
      name: tag(el, "name"),
      operator: tag(el, "operator"),
      voltage: tag(el, "voltage"),
      substationType: null,
      cables: tag(el, "cables"),
    },
  };
}

/** Count of features (of the given kind) where `properties[key]` is not null. */
function fieldCoverage(features, keys) {
  const coverage = {};
  for (const key of keys) {
    coverage[key] = features.filter((f) => f.properties[key] !== null).length;
  }
  return coverage;
}

async function main() {
  const substationResult = await postOverpass(SUBSTATION_QUERY);
  const substationElements = substationResult.elements ?? [];

  const lineResult = await postOverpass(LINE_QUERY);
  const lineElements = lineResult.elements ?? [];

  const hifldOrg = await getJson(HIFLD_ORG_SERVICES);
  const hifldServices = hifldOrg.services ?? [];
  const hifldServiceCount = hifldServices.length;
  const hifldSubstationServices = hifldServices
    .filter((s) => /substation/i.test(s.name ?? ""))
    .map((s) => s.name);

  const crossCheckParams = new URLSearchParams({
    geometry: BBOX_WSEN.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
    returnCountOnly: "true",
    f: "json",
  });
  const crossCheck = await getJson(`${HIFLD_TL_LAYER}/query?${crossCheckParams}`);
  const crossCheckCount = crossCheck.count;

  // Assertions — fail loudly rather than commit a wrong or stale file.
  if (substationElements.length < SUBSTATION_MIN || substationElements.length > SUBSTATION_MAX) {
    throw new Error(
      `substation element count ${substationElements.length} is outside [${SUBSTATION_MIN}, ${SUBSTATION_MAX}]`,
    );
  }
  if (lineElements.length < LINE_MIN || lineElements.length > LINE_MAX) {
    throw new Error(`line way count ${lineElements.length} is outside [${LINE_MIN}, ${LINE_MAX}]`);
  }
  for (const el of substationElements) {
    const center = el.center ?? { lat: el.lat, lon: el.lon };
    if (!Number.isFinite(center.lon) || !Number.isFinite(center.lat)) {
      throw new Error(`substation ${osmId(el)} has non-finite coordinates`);
    }
  }
  for (const el of lineElements) {
    if (!Array.isArray(el.geometry) || el.geometry.length < 2) {
      throw new Error(`line ${osmId(el)} has fewer than 2 vertices`);
    }
  }
  if (hifldSubstationServices.length !== 0) {
    throw new Error(
      `unexpected HIFLD substation service(s) found: ${hifldSubstationServices.join(", ")} — an authoritative substations layer may have appeared; the meta's "checked" copy is stale and must be rewritten by a human before shipping`,
    );
  }
  if (!Number.isFinite(crossCheckCount) || crossCheckCount <= 0) {
    throw new Error(`HIFLD cross-check count is not a finite positive number: ${crossCheckCount}`);
  }

  const substationFeatures = substationElements.map(substationFeature);
  const lineFeatures = lineElements.map(lineFeature);
  const features = [...substationFeatures, ...lineFeatures];
  const featureCollection = { type: "FeatureCollection", features };
  const dataJson = JSON.stringify(featureCollection);

  const retrievedAt = new Date().toISOString();

  const meta = {
    county: "rock-island",
    countyName: "Rock Island County, IL",
    source: "OpenStreetMap",
    sourceQueryApi: "Overpass API",
    sourceEndpoint: OVERPASS,
    sourceLicense: "Open Database License (ODbL) v1.0",
    sourceLicenseUrl: "https://www.openstreetmap.org/copyright",
    sourceAttribution: "© OpenStreetMap contributors",
    sourceLicenseNote:
      "This file is a Derivative Database of OpenStreetMap and is offered under the same Open Database License (ODbL) v1.0.",
    retrievedAt,
    bbox: BBOX_WSEN,
    bboxLabel: "91.0721°W–90.1599°W, 41.3268°N–41.7830°N",
    bboxNote:
      "The bounding box of Rock Island County, IL from the US Census TIGERweb county layer. It is a rectangle, so it also covers neighbouring ground — including part of Scott County, Iowa across the Mississippi. Infrastructure outside the county line is kept, because a site's nearest substation does not stop at a county boundary.",
    bboxSourceUrl:
      "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/13",
    categories: [
      {
        key: "substation",
        label: "Electric substations",
        available: true,
        osmQuery: 'node/way/relation["power"="substation"]',
        featureCount: substationFeatures.length,
        fieldCoverage: fieldCoverage(substationFeatures, [
          "name",
          "operator",
          "voltage",
          "substationType",
        ]),
        checked: null,
        note: "Drawn at each substation's centre point. OpenStreetMap maps most substations as an area; the centre point is used so they stay legible at county zoom.",
      },
      {
        key: "transmission-line",
        label: "Transmission lines",
        available: true,
        osmQuery: 'way["power"="line"]',
        featureCount: lineFeatures.length,
        fieldCoverage: fieldCoverage(lineFeatures, ["name", "operator", "voltage", "cables"]),
        checked: null,
        note: "power=line only. power=minor_line (low-voltage distribution) and power=tower (pylons) are excluded — neither is transmission infrastructure a data-centre site is assessed against.",
      },
      {
        key: "interconnection-capacity",
        label: "Available interconnection capacity (MW) per substation",
        available: false,
        osmQuery: null,
        featureCount: null,
        fieldCoverage: null,
        checked: `OpenStreetMap: none of the substation features in this snapshot carry any capacity, rating, MVA or load tag. HIFLD Open (GeoPlatform ArcGIS org Hp6G80Pky0om7QvQ): ${hifldSubstationServices.length} of ${hifldServiceCount} published services have a name matching /substation/i — HIFLD's substations layer is not in the public catalogue, and HIFLD Secure (gii.dhs.gov) is login-gated.`,
        note: "No public source found for Rock Island County. Not shown, and not estimated.",
      },
    ],
    crossCheck: {
      source: "HIFLD Open — Electric Power Transmission Lines",
      url: HIFLD_TL_LAYER,
      featureCount: crossCheckCount,
      note: "An independent federal source covering the same box. The two feature counts are not comparable — HIFLD publishes one feature per circuit run while OpenStreetMap splits a way wherever its tags change. Cited as corroboration that transmission lines exist here, never as a coverage measure.",
      licenseKnown: false,
      licenseNote:
        "The HIFLD service publishes no copyrightText and has no ArcGIS Online item carrying licence terms, so its geometry is not redistributed in this build — only its feature count is cited.",
    },
    hifldSubstationServices,
    hifldServiceCount,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_DATA, dataJson);
  await writeFile(OUT_META, JSON.stringify(meta, null, 2) + "\n");

  console.log(`substations:              ${substationFeatures.length}`);
  console.log(`lines:                    ${lineFeatures.length}`);
  console.log(`bytes:                    ${Buffer.byteLength(dataJson)}`);
  console.log(`HIFLD cross-check count:  ${crossCheckCount}`);
  console.log(`HIFLD services scanned:   ${hifldServiceCount}`);
  console.log(`HIFLD substation matches: ${hifldSubstationServices.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
