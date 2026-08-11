"use client";

import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { toParcel, type Parcel, type RawParcelProperties } from "@/lib/parcel";
import { pointInRing, polygonCentroid, rectRing, type LngLat } from "@/lib/geo";
import ParcelDetails from "./ParcelDetails";
import ParcelMap from "./ParcelMap";
import SelectionSummary from "./SelectionSummary";

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

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

export default function MapWorkspace() {
  // `raw` is what MapLibre renders; `parcels` is the typed view every panel reads. Both
  // are kept deliberately — `parcels` is never re-serialised back into GeoJSON.
  const [raw, setRaw] = useState<FeatureCollection | null>(null);
  const [parcels, setParcels] = useState<Parcel[] | null>(null);
  const [centroids, setCentroids] = useState<Map<string, LngLat> | null>(null);
  const [meta, setMeta] = useState<ParcelMeta | null>(null);
  const [selectedPins, setSelectedPins] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [flyTo, setFlyTo] = useState<{ center: LngLat; zoom: number; nonce: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [dataResponse, metaResponse] = await Promise.all([
          fetch("/data/rock-island-parcels.json"),
          fetch("/data/rock-island-parcels.meta.json"),
        ]);
        if (!dataResponse.ok || !metaResponse.ok) throw new Error("parcel data fetch failed");
        const collection = (await dataResponse.json()) as FeatureCollection;
        const metaJson = (await metaResponse.json()) as ParcelMeta;
        if (cancelled) return;

        const mapped = collection.features.map((feature) =>
          toParcel(feature as Feature<Geometry, RawParcelProperties>),
        );
        setRaw(collection);
        setMeta(metaJson);
        setParcels(mapped);
        setCentroids(new Map(mapped.map((p) => [p.pin, polygonCentroid(p.geometry)])));
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedParcels = useMemo(
    () => parcels?.filter((p) => selectedPins.includes(p.pin)) ?? [],
    [parcels, selectedPins],
  );

  /** A click replaces the selection rather than adding to it. */
  function handleParcelClick(pin: string) {
    setSelectedPins([pin]);
  }

  /**
   * The selection rule, and it is printed on screen: a parcel is selected when its centre
   * point falls inside the drawn shape. Drawing a new shape replaces the previous
   * selection.
   */
  function handleRectDrawn(a: LngLat, b: LngLat) {
    if (!parcels || !centroids) return;
    const ring = rectRing(a, b);
    const hit = parcels
      .filter((p) => {
        const centre = centroids.get(p.pin);
        return centre ? pointInRing(centre, ring) : false;
      })
      .map((p) => p.pin);
    setSelectedPins(hit);
    setDrawing(false);
  }

  /**
   * Only 6 of the 6,026 loaded parcels have a blank source field, so a reviewer clicking
   * at random would essentially never reach one. `incompletePins` is written sorted
   * ascending by the fetch script, so the first entry is deterministic.
   */
  function handleShowIncomplete() {
    if (!meta || !centroids) return;
    const pin = meta.incompletePins[0];
    if (!pin) return;
    setSelectedPins([pin]);
    const centre = centroids.get(pin);
    if (centre) setFlyTo({ center: centre, zoom: 15, nonce: Date.now() });
  }

  if (failed) {
    return (
      <p className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        Could not load the parcel data file. Reload the page.
      </p>
    );
  }

  if (!raw || !meta || !parcels || !centroids) {
    return (
      <p className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        Loading Rock Island County parcels…
      </p>
    );
  }

  return (
    <div className="mt-4">
      <SelectionSummary
        count={selectedPins.length}
        meta={meta}
        onShowIncomplete={handleShowIncomplete}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="draw-area"
          aria-pressed={drawing}
          onClick={() => setDrawing((d) => !d)}
          className={BUTTON_CLASS}
        >
          {drawing ? "Cancel drawing" : "Draw area"}
        </button>
        <button
          type="button"
          data-testid="clear-selection"
          onClick={() => setSelectedPins([])}
          disabled={selectedPins.length === 0}
          className={BUTTON_CLASS}
        >
          Clear selection
        </button>
      </div>

      <ParcelMap
        data={raw}
        bbox={meta.bbox}
        selectedPins={selectedPins}
        drawing={drawing}
        onParcelClick={handleParcelClick}
        onRectDrawn={handleRectDrawn}
        flyTo={flyTo}
      />

      <div className="mt-3">
        <ParcelDetails parcel={selectedParcels.length === 1 ? selectedParcels[0] : null} />
      </div>
    </div>
  );
}
