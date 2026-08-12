import type { Geometry } from "geojson";

/**
 * Coordinates are treated as planar degrees throughout. At 41.5°N across Rock Island
 * County's ≈76 km × 49 km extent, the error from ignoring Earth curvature stays far below
 * one parcel width for the point-in-polygon and centroid uses here, so no projection is
 * applied. This is a decision, not an oversight — do not "fix" it.
 */
export type LngLat = { lng: number; lat: number };

/** A closed ring: the last element equals the first. */
export type Ring = LngLat[];

/**
 * Build a rectangle ring from two drag corners. Corners are normalised so the drag
 * direction is irrelevant. Returns exactly 5 points, closed.
 */
export function rectRing(a: LngLat, b: LngLat): Ring {
  const west = Math.min(a.lng, b.lng);
  const east = Math.max(a.lng, b.lng);
  const south = Math.min(a.lat, b.lat);
  const north = Math.max(a.lat, b.lat);
  return [
    { lng: west, lat: south },
    { lng: east, lat: south },
    { lng: east, lat: north },
    { lng: west, lat: north },
    { lng: west, lat: south },
  ];
}

/**
 * Even-odd ray cast, written generically over any closed ring rather than specialised to
 * a rectangle, so a freehand lasso is a later drop-in with no change here.
 *
 * Behaviour exactly on an edge or a vertex is unspecified.
 */
export function pointInRing(p: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shoelace centroid of one closed ring. Returns the first vertex for a degenerate ring. */
function ringCentroid(ring: number[][]): LngLat {
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
 * The parcel's centre point, used by the selection rule: a parcel is selected when its
 * centre falls inside the drawn shape.
 *
 * For a MultiPolygon, the outer ring with the most vertices wins — 618 of the 65,953 mapped
 * county parcels are MultiPolygons, typically a main lot plus a sliver.
 *
 * Retained as the reference implementation that `scripts/fetch-parcels.mjs` mirrors when it
 * precomputes every parcel's centroid at extract time; the browser reads that precomputed
 * value off `Parcel.centroid` and no longer calls this at runtime.
 */
export function polygonCentroid(geometry: Geometry): LngLat {
  if (geometry.type === "Polygon") {
    return ringCentroid(geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    let largest: number[][] | null = null;
    for (const polygon of geometry.coordinates) {
      const outer = polygon[0];
      if (largest === null || outer.length > largest.length) largest = outer;
    }
    if (largest === null) throw new Error("unsupported geometry: empty MultiPolygon");
    return ringCentroid(largest);
  }
  throw new Error("unsupported geometry: " + geometry.type);
}

/** Convert a Ring to a GeoJSON Polygon, for feeding the rubber-band rectangle to MapLibre. */
export function ringToGeoJsonPolygon(ring: Ring): { type: "Polygon"; coordinates: number[][][] } {
  return { type: "Polygon", coordinates: [ring.map((p) => [p.lng, p.lat])] };
}
