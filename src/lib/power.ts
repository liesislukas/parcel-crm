import type { Feature, Geometry } from "geojson";
import { textField, type FieldState } from "@/lib/parcel";
import type { LngLat } from "@/lib/geo";

/**
 * Distances here are computed in a local equirectangular frame anchored at the ORIGIN
 * point's latitude (never at each segment's midpoint — that is what makes the result
 * deterministic regardless of iteration order):
 *
 *   x = (lng - origin.lng) * metresPerDegreeLon(origin.lat)
 *   y = (lat - origin.lat) * METRES_PER_DEGREE_LAT
 *
 * `src/lib/geo.ts` deliberately works in planar degrees and is not modified by this file —
 * its contract (documented at its own lines 3–7) is for parcel-scale geometry, not metres.
 * Metres are needed for a human-readable distance readout, so this module keeps its own
 * small projection rather than reprojecting `geo.ts`.
 *
 * Anchoring at the origin's latitude introduces error versus a true great-circle distance,
 * growing with both the north-south span between the two points and their distance from the
 * anchor latitude. Over the ~50 km span of the Rock Island power snapshot bbox at 41.5°N,
 * the error is under 0.1% — far below the precision `formatDistance` displays (two decimal
 * places of a kilometre). This is not a routed circuit distance and not a great-circle
 * distance; see `POWER_DERIVATION`, which states exactly this to the UI.
 */
export const METRES_PER_DEGREE_LAT = 111_320;

export function metresPerDegreeLon(lat: number): number {
  return METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

export type PowerKind = "substation" | "transmission-line";

/** The eight snapshot fields, spelled exactly as scripts/fetch-power.mjs writes them. */
export type RawPowerProperties = {
  kind: unknown;
  osmId: unknown;
  osmUrl: unknown;
  name: unknown;
  operator: unknown;
  voltage: unknown;
  substationType: unknown;
  cables: unknown;
};

export type PowerFeature = {
  kind: PowerKind;
  osmId: string; // "way/253858380"
  osmUrl: string; // "https://www.openstreetmap.org/way/253858380"
  name: FieldState<string>;
  operator: FieldState<string>;
  voltage: FieldState<string>; // kept as the source string, e.g. "345000;161000"
  substationType: FieldState<string>;
  cables: FieldState<string>;
  point: LngLat | null; // substations only
  path: LngLat[] | null; // transmission lines only
};

export type PowerCategoryKey = "substation" | "transmission-line" | "interconnection-capacity";

export type PowerCategory = {
  key: PowerCategoryKey;
  label: string;
  available: boolean;
  osmQuery: string | null;
  featureCount: number | null;
  fieldCoverage: Record<string, number> | null;
  checked: string | null;
  note: string;
};

/** Mirrors public/data/rock-island-power.meta.json exactly. */
export type PowerMeta = {
  county: string;
  countyName: string;
  source: string;
  sourceQueryApi: string;
  sourceEndpoint: string;
  sourceLicense: string;
  sourceLicenseUrl: string;
  sourceAttribution: string;
  sourceLicenseNote: string;
  retrievedAt: string;
  bbox: [number, number, number, number];
  bboxLabel: string;
  bboxNote: string;
  bboxSourceUrl: string;
  categories: PowerCategory[];
  crossCheck: {
    source: string;
    url: string;
    featureCount: number;
    note: string;
    licenseKnown: boolean;
    licenseNote: string;
  };
  hifldSubstationServices: string[];
  hifldServiceCount: number;
};

/**
 * Every raw property goes through `textField`, so `null`, `""` and `" "` all become
 * `{ present: false }` — the same absence contract `toParcel` uses in `src/lib/parcel.ts`.
 */
export function toPowerFeature(f: Feature<Geometry, RawPowerProperties>): PowerFeature {
  const p = f.properties;
  const kindField = textField(p.kind);
  if (
    !kindField.present ||
    (kindField.value !== "substation" && kindField.value !== "transmission-line")
  ) {
    throw new Error("unsupported power kind: " + String(p.kind));
  }
  const kind = kindField.value;

  const osmIdField = textField(p.osmId);
  const osmUrlField = textField(p.osmUrl);

  let point: LngLat | null = null;
  let path: LngLat[] | null = null;
  if (f.geometry.type === "Point") {
    const [lng, lat] = f.geometry.coordinates;
    point = { lng, lat };
  } else if (f.geometry.type === "LineString") {
    path = f.geometry.coordinates.map(([lng, lat]) => ({ lng, lat }));
  } else {
    throw new Error("unsupported power geometry: " + f.geometry.type);
  }

  return {
    kind,
    osmId: osmIdField.present ? osmIdField.value : "",
    osmUrl: osmUrlField.present ? osmUrlField.value : "",
    name: textField(p.name),
    operator: textField(p.operator),
    voltage: textField(p.voltage),
    substationType: textField(p.substationType),
    cables: textField(p.cables),
    point,
    path,
  };
}

/** Straight-line distance in metres, in the equirectangular frame anchored at `a`. */
export function distanceMetres(a: LngLat, b: LngLat): number {
  const x = (b.lng - a.lng) * metresPerDegreeLon(a.lat);
  const y = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
  return Math.sqrt(x * x + y * y);
}

/**
 * Standard point-to-segment projection, in the same frame anchored at `p`. The projection
 * parameter is clamped to [0, 1]; a zero-length segment returns the distance to `a`.
 */
export function distanceToSegmentMetres(p: LngLat, a: LngLat, b: LngLat): number {
  const lonScale = metresPerDegreeLon(p.lat);
  const px = 0;
  const py = 0;
  const ax = (a.lng - p.lng) * lonScale;
  const ay = (a.lat - p.lat) * METRES_PER_DEGREE_LAT;
  const bx = (b.lng - p.lng) * lonScale;
  const by = (b.lat - p.lat) * METRES_PER_DEGREE_LAT;

  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;

  if (lenSq === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * `distanceMetres(p, f.point)` for a substation; the minimum over consecutive vertex pairs
 * of `f.path` for a line; `null` when both `point` and `path` are `null` or `path` has fewer
 * than 2 vertices.
 */
export function distanceToFeatureMetres(p: LngLat, f: PowerFeature): number | null {
  if (f.point) {
    return distanceMetres(p, f.point);
  }
  if (f.path && f.path.length >= 2) {
    let min = Infinity;
    for (let i = 0; i < f.path.length - 1; i++) {
      const d = distanceToSegmentMetres(p, f.path[i], f.path[i + 1]);
      if (d < min) min = d;
    }
    return min;
  }
  return null;
}

export type NearestResult = { feature: PowerFeature; metres: number; fromPin: string };

/**
 * Iterates every origin × feature-of-that-kind pair and returns the minimum, carrying the
 * `pin` of the origin that achieved it. Ties keep the first feature in array order. Returns
 * `null` when `origins` is empty, when no feature has that kind, or when every distance is
 * `null`.
 */
export function nearestPowerFeature(
  origins: { pin: string; centre: LngLat }[],
  features: PowerFeature[],
  kind: PowerKind,
): NearestResult | null {
  const candidates = features.filter((f) => f.kind === kind);
  let best: NearestResult | null = null;

  for (const origin of origins) {
    for (const feature of candidates) {
      const metres = distanceToFeatureMetres(origin.centre, feature);
      if (metres === null) continue;
      if (best === null || metres < best.metres) {
        best = { feature, metres, fromPin: origin.pin };
      }
    }
  }

  return best;
}

/** "0.89 km (0.55 mi)" */
export function formatDistance(metres: number): string {
  return `${(metres / 1000).toFixed(2)} km (${(metres / 1609.344).toFixed(2)} mi)`;
}

/**
 * The name if present; else the operator form; else an "Unnamed <kind> (OpenStreetMap <id>)"
 * fallback. Never invents a label from nothing.
 */
export function powerFeatureLabel(f: PowerFeature): string {
  if (f.name.present) return f.name.value;
  if (f.operator.present) {
    return `${f.operator.value} ${f.kind === "substation" ? "substation" : "line"}`;
  }
  return `Unnamed ${f.kind === "substation" ? "substation" : "transmission line"} (OpenStreetMap ${f.osmId})`;
}

export const POWER_DERIVATION =
  "Straight-line distance from each selected parcel's centre point to the nearest point of each power feature, taken as the minimum across the selection. Computed on a local equirectangular projection anchored at the parcel's latitude. This is not a routed circuit distance and not an interconnection study.";
