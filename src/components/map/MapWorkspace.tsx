"use client";

import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { pointInRing, rectRing, type LngLat } from "@/lib/geo";
import { loadParcelData, type ParcelData } from "@/lib/parcelData";
import type { Project } from "@/lib/project";
import { findProject } from "@/lib/projectStore";
import {
  toPowerFeature,
  type PowerFeature,
  type PowerMeta,
  type RawPowerProperties,
} from "@/lib/power";
import ParcelDetails from "./ParcelDetails";
import ParcelMap from "./ParcelMap";
import PowerPanel from "./PowerPanel";
import SelectionActions from "./SelectionActions";
import SelectionSummary from "./SelectionSummary";

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

export default function MapWorkspace() {
  const [data, setData] = useState<ParcelData | null>(null);
  const [selectedPins, setSelectedPins] = useState<string[]>([]);
  const [focusedPin, setFocusedPin] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [flyTo, setFlyTo] = useState<{ center: LngLat; zoom: number; nonce: number } | null>(null);
  const [fitTo, setFitTo] = useState<{
    bbox: [number, number, number, number];
    nonce: number;
  } | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [failed, setFailed] = useState(false);

  const [powerRaw, setPowerRaw] = useState<FeatureCollection | null>(null);
  const [powerFeatures, setPowerFeatures] = useState<PowerFeature[] | null>(null);
  const [powerMeta, setPowerMeta] = useState<PowerMeta | null>(null);
  const [powerFailed, setPowerFailed] = useState(false);
  const [powerVisible, setPowerVisible] = useState(true);
  const [fitBbox, setFitBbox] = useState<{
    bbox: [number, number, number, number];
    nonce: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loaded = await loadParcelData();
        if (cancelled) return;
        setData(loaded);

        // `MapWorkspace` is client-only (`ssr: false` via `MapSection.tsx`), so `window` is
        // safe here and reading it this way avoids the Suspense boundary `useSearchParams`
        // would require during prerender.
        const id = new URLSearchParams(window.location.search).get("project");
        if (id === null) return;
        const project = findProject(id);
        if (project === null) return;

        const present = project.pins.filter((p) => loaded.parcelsByPin.has(p));
        setSelectedPins(present);
        setEditingProject(project);

        let west = Infinity;
        let south = Infinity;
        let east = -Infinity;
        let north = -Infinity;
        for (const pin of present) {
          const centre = loaded.centroids.get(pin);
          if (!centre) continue;
          west = Math.min(west, centre.lng);
          south = Math.min(south, centre.lat);
          east = Math.max(east, centre.lng);
          north = Math.max(north, centre.lat);
        }
        if (west === Infinity) return;
        if (west === east || south === north) {
          west -= 0.0008;
          south -= 0.0008;
          east += 0.0008;
          north += 0.0008;
        }
        setFitTo({ bbox: [west, south, east, north], nonce: Date.now() });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // A second, separate effect — not merged into the parcel `Promise.all` above. A
  // power-fetch failure must never blank the parcel map.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [dataResponse, metaResponse] = await Promise.all([
          fetch("/data/rock-island-power.json"),
          fetch("/data/rock-island-power.meta.json"),
        ]);
        if (!dataResponse.ok || !metaResponse.ok) throw new Error("power data fetch failed");
        const collection = (await dataResponse.json()) as FeatureCollection;
        const metaJson = (await metaResponse.json()) as PowerMeta;
        if (cancelled) return;

        const mapped = collection.features.map((feature) =>
          toPowerFeature(feature as Feature<Geometry, RawPowerProperties>),
        );
        setPowerRaw(collection);
        setPowerMeta(metaJson);
        setPowerFeatures(mapped);
      } catch {
        if (!cancelled) setPowerFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const powerState = powerFailed
    ? ({ status: "failed" } as const)
    : powerFeatures && powerMeta
      ? ({ status: "ready", features: powerFeatures, meta: powerMeta } as const)
      : ({ status: "loading" } as const);

  const powerSelection = useMemo(() => {
    if (!data) return [];
    return selectedPins.flatMap((pin) => {
      const centre = data.centroids.get(pin);
      return centre ? [{ pin, centre }] : [];
    });
  }, [selectedPins, data]);

  /**
   * Clicking a parcel adds it to the selection and never removes anything. Repeat clicks on
   * the same parcel are idempotent (it stays selected and becomes the focused parcel whose
   * details show). This is deliberate: a plain click used to replace the whole multi-parcel
   * selection, which silently dropped a selection a user had already built up. Removing a
   * parcel is now an explicit action via `handleRemovePin`.
   */
  function handleParcelClick(pin: string) {
    setSelectedPins((prev) => (prev.includes(pin) ? prev : [...prev, pin]));
    setFocusedPin(pin);
  }

  /**
   * The selection rule, and it is printed on screen: a parcel is selected when its centre
   * point falls inside the drawn shape. Drawing a new shape replaces the previous selection —
   * unchanged from before, and it is an explicit two-step action (toggle Draw area, then
   * drag), so it is not a silent-loss path the way a plain click used to be.
   */
  function handleRectDrawn(a: LngLat, b: LngLat) {
    if (!data) return;
    const ring = rectRing(a, b);
    const hit = data.parcels
      .filter((p) => {
        const centre = data.centroids.get(p.pin);
        return centre ? pointInRing(centre, ring) : false;
      })
      .map((p) => p.pin);
    setSelectedPins(hit);
    setFocusedPin(null);
    setDrawing(false);
  }

  /**
   * Only 6 of the 6,026 loaded parcels have a blank source field, so a reviewer clicking
   * at random would essentially never reach one. `incompletePins` is written sorted
   * ascending by the fetch script, so the first entry is deterministic.
   */
  function handleShowIncomplete() {
    if (!data) return;
    const pin = data.meta.incompletePins[0];
    if (!pin) return;
    setSelectedPins((prev) => (prev.includes(pin) ? prev : [...prev, pin]));
    setFocusedPin(pin);
    const centre = data.centroids.get(pin);
    if (centre) setFlyTo({ center: centre, zoom: 15, nonce: Date.now() });
  }

  /** The explicit removal path — also the AC6 removal half. */
  function handleRemovePin(pin: string) {
    setSelectedPins((prev) => prev.filter((p) => p !== pin));
    setFocusedPin((current) => (current === pin ? null : current));
  }

  /** `Clear selection` asks for confirmation when 2 or more parcels are selected. */
  function handleClearSelection() {
    if (selectedPins.length >= 2) {
      const ok = window.confirm(
        "Clear all " + selectedPins.length + " selected parcels? This cannot be undone.",
      );
      if (!ok) return;
    }
    setSelectedPins([]);
    setFocusedPin(null);
  }

  if (failed) {
    return (
      <p className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        Could not load the parcel data file. Reload the page.
      </p>
    );
  }

  if (!data) {
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
        meta={data.meta}
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
          onClick={handleClearSelection}
          disabled={selectedPins.length === 0}
          className={BUTTON_CLASS}
        >
          Clear selection
        </button>
        <button
          type="button"
          data-testid="toggle-power"
          aria-pressed={powerVisible}
          onClick={() => setPowerVisible((v) => !v)}
          className={BUTTON_CLASS}
        >
          {powerVisible ? "Hide power infrastructure" : "Show power infrastructure"}
        </button>
        <button
          type="button"
          data-testid="zoom-power"
          disabled={!powerMeta}
          onClick={() => {
            if (powerMeta) setFitBbox({ bbox: powerMeta.bbox, nonce: Date.now() });
          }}
          className={BUTTON_CLASS}
        >
          Zoom to power infrastructure
        </button>
      </div>

      <ParcelMap
        data={data.raw}
        bbox={data.meta.bbox}
        selectedPins={selectedPins}
        drawing={drawing}
        onParcelClick={handleParcelClick}
        onRectDrawn={handleRectDrawn}
        flyTo={flyTo}
        fitTo={fitTo}
        power={powerRaw}
        powerVisible={powerVisible}
        fitBbox={fitBbox}
      />

      {editingProject !== null ? (
        <p
          data-testid="project-mode"
          className="mt-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
        >
          {`Editing project “${editingProject.name}”. Click parcels on the map to add them, use Remove in the list to take one out, then save.`}
        </p>
      ) : null}

      <SelectionActions
        selectedPins={selectedPins}
        parcelsByPin={data.parcelsByPin}
        adjacency={data.adjacency}
        onRemovePin={handleRemovePin}
        onFocusPin={setFocusedPin}
        onReplaceSelection={(pins) => {
          setSelectedPins(pins);
          setFocusedPin(null);
        }}
        editingProject={editingProject}
        onProjectSaved={(p) => setEditingProject(p)}
      />

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ParcelDetails parcel={focusedPin ? (data.parcelsByPin.get(focusedPin) ?? null) : null} />
        <PowerPanel state={powerState} selection={powerSelection} />
      </div>
    </div>
  );
}
