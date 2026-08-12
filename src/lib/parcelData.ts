import { toParcelFromRow, type Parcel, type ParcelAttrRow } from "@/lib/parcel";
import { adjacencyFromRows, type AdjacencyIndex } from "@/lib/adjacency";
import type { LngLat } from "@/lib/geo";

/** Mirrors `public/data/rock-island-parcels.meta.json` exactly. */
export type ParcelMeta = {
  county: string;
  countyName: string;
  sourceLayerUrl: string;
  sourceOrg: string;
  sourceLicense: string;
  retrievedAt: string;
  coverage: "full-county";
  bbox: [number, number, number, number];
  bboxLabel: string;
  areaLabel: string;
  parcelCount: number;
  countyParcelCount: number;
  mappedParcelCount: number;
  unmappedPins: string[];
  incompletePins: string[];
  tiles: { path: string; layer: string; minzoom: number; maxzoom: number; idProperty: string };
};

export type ParcelData = {
  parcels: Parcel[]; // all 65,955, in attrs row order
  parcelsById: ReadonlyMap<string, Parcel>; // 65,955 entries — the identity index
  idsByPin: ReadonlyMap<string, string[]>; // PIN -> every id carrying it; collisions kept
  centroids: ReadonlyMap<string, LngLat>; // 65,953 entries; the 2 unmappable records are absent
  adjacency: AdjacencyIndex;
  meta: ParcelMeta;
};

/**
 * `/`, `/owners`, `/projects` and `/projects/[id]` all need the same county attributes. This
 * module pulls the 10.7 MB columnar attributes sidecar and the 1.6 MB precomputed adjacency
 * file at most once per browser session; every caller after the first await shares the same
 * in-flight (or resolved) promise.
 *
 * Geometry is never loaded here. It is served as PMTiles vector tiles straight to MapLibre,
 * and the centroid and footprint key each surface needs are precomputed into the sidecar.
 */
let cached: Promise<ParcelData> | null = null;

export function loadParcelData(): Promise<ParcelData> {
  if (cached) return cached;

  cached = (async () => {
    const [attrsResponse, adjacencyResponse, metaResponse] = await Promise.all([
      fetch("/data/rock-island-parcels.attrs.json"),
      fetch("/data/rock-island-parcels.adjacency.json"),
      fetch("/data/rock-island-parcels.meta.json"),
    ]);
    if (!attrsResponse.ok || !adjacencyResponse.ok || !metaResponse.ok) {
      throw new Error("parcel data fetch failed");
    }

    const attrs = (await attrsResponse.json()) as { columns: string[]; rows: ParcelAttrRow[] };
    const adjacencyRows = (await adjacencyResponse.json()) as number[][];
    const meta = (await metaResponse.json()) as ParcelMeta;

    const parcels = attrs.rows.map(toParcelFromRow);

    const parcelsById = new Map<string, Parcel>();
    const idsByPin = new Map<string, string[]>();
    const centroids = new Map<string, LngLat>();
    const ids: string[] = [];
    for (const parcel of parcels) {
      ids.push(parcel.id);
      parcelsById.set(parcel.id, parcel);
      const forPin = idsByPin.get(parcel.pin);
      if (forPin) forPin.push(parcel.id);
      else idsByPin.set(parcel.pin, [parcel.id]);
      if (parcel.centroid !== null) centroids.set(parcel.id, parcel.centroid);
    }

    const adjacency = adjacencyFromRows(ids, adjacencyRows);

    return { parcels, parcelsById, idsByPin, centroids, adjacency, meta };
  })();

  cached.catch(() => {
    cached = null;
  });

  return cached;
}
