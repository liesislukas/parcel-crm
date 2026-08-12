"use client";

import { useEffect, useState } from "react";
import { pointInRing, rectRing, type LngLat } from "@/lib/geo";
import { loadParcelData, type ParcelData } from "@/lib/parcelData";
import ParcelDetails from "./ParcelDetails";
import ParcelMap from "./ParcelMap";
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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loaded = await loadParcelData();
        if (cancelled) return;
        setData(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
      </div>

      <ParcelMap
        data={data.raw}
        bbox={data.meta.bbox}
        selectedPins={selectedPins}
        drawing={drawing}
        onParcelClick={handleParcelClick}
        onRectDrawn={handleRectDrawn}
        flyTo={flyTo}
      />

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
      />

      <div className="mt-3">
        <ParcelDetails parcel={focusedPin ? (data.parcelsByPin.get(focusedPin) ?? null) : null} />
      </div>
    </div>
  );
}
