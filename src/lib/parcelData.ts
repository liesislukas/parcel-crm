import type { Feature, FeatureCollection, Geometry } from "geojson";
import { toParcel, type Parcel, type RawParcelProperties } from "@/lib/parcel";
import { polygonCentroid, type LngLat } from "@/lib/geo";
import { buildAdjacencyIndex, type AdjacencyIndex } from "@/lib/adjacency";

/** Mirrors `public/data/rock-island-parcels.meta.json` exactly. */
export type ParcelMeta = {
  county: string;
  countyName: string;
  sourceLayerUrl: string;
  sourceOrg: string;
  retrievedAt: string;
  bbox: [number, number, number, number];
  bboxLabel: string;
  areaLabel: string;
  parcelCount: number;
  countyParcelCount: number;
  incompletePins: string[];
};

export type ParcelData = {
  raw: FeatureCollection;
  parcels: Parcel[];
  parcelsByPin: ReadonlyMap<string, Parcel>;
  centroids: ReadonlyMap<string, LngLat>;
  adjacency: AdjacencyIndex;
  meta: ParcelMeta;
};

/**
 * `/`, `/projects` and `/projects/[id]` all need the same 2.96 MB parcel file. This module
 * loads and parses it at most once per browser session; every caller after the first await
 * shares the same in-flight (or resolved) promise.
 */
let cached: Promise<ParcelData> | null = null;

export function loadParcelData(): Promise<ParcelData> {
  if (cached) return cached;

  cached = (async () => {
    const [dataResponse, metaResponse] = await Promise.all([
      fetch("/data/rock-island-parcels.json"),
      fetch("/data/rock-island-parcels.meta.json"),
    ]);
    if (!dataResponse.ok || !metaResponse.ok) throw new Error("parcel data fetch failed");

    const collection = (await dataResponse.json()) as FeatureCollection;
    const meta = (await metaResponse.json()) as ParcelMeta;

    const parcels = collection.features.map((f) =>
      toParcel(f as Feature<Geometry, RawParcelProperties>),
    );
    const parcelsByPin = new Map(parcels.map((p) => [p.pin, p]));
    const centroids = new Map(parcels.map((p) => [p.pin, polygonCentroid(p.geometry)]));
    const adjacency = buildAdjacencyIndex(parcels);

    return { raw: collection, parcels, parcelsByPin, centroids, adjacency, meta };
  })();

  cached.catch(() => {
    cached = null;
  });

  return cached;
}
