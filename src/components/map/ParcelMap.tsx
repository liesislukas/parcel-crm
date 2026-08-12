"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import { rectRing, ringToGeoJsonPolygon, type LngLat } from "@/lib/geo";

type ParcelMapProps = {
  data: FeatureCollection;
  bbox: [number, number, number, number];
  selectedPins: string[];
  drawing: boolean;
  onParcelClick: (pin: string) => void;
  onRectDrawn: (a: LngLat, b: LngLat) => void;
  flyTo: { center: LngLat; zoom: number; nonce: number } | null;
  fitTo: { bbox: [number, number, number, number]; nonce: number } | null;
};

const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Keyless basemap. No style URL, no access token, no environment variable — the deployed
 * runtime must stay public and buildable by anyone who clones the repo.
 */
const KEYLESS_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

/**
 * maplibre-gl 6 locates its geometry worker with
 * `new URL(`./${isDev ? "…-dev" : "…"}.mjs`, import.meta.url)`. Turbopack statically
 * collapses that template literal to the wrong emitted asset, and the asset it does emit
 * still carries a bare `import "./maplibre-gl-shared.mjs"` that Turbopack has renamed with
 * a content hash. Either way the worker never boots — and MapLibre reports no error, it
 * simply leaves every GeoJSON source with zero tiles, so the basemap draws and the parcels
 * silently do not.
 *
 * Pointing the worker at a self-consistent same-origin copy fixes it. The copy is written
 * from the pinned package by `scripts/copy-maplibre-worker.mjs` on `prebuild` / `predev`,
 * so it can never drift from `maplibre-gl@6.3.0`.
 */
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

function selectionFilter(pins: string[]): maplibregl.FilterSpecification {
  return ["in", ["get", "PIN"], ["literal", pins]];
}

export default function ParcelMap(props: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);

  // Props read from inside MapLibre's own event handlers. The map is created exactly once
  // in a `[]`-deps effect, so every handler would otherwise close over the first render's
  // props forever. Refs updated after each commit keep them current without ever
  // recreating the map.
  const dataRef = useRef(props.data);
  const bboxRef = useRef(props.bbox);
  const selectedPinsRef = useRef(props.selectedPins);
  const drawingRef = useRef(props.drawing);
  const onParcelClickRef = useRef(props.onParcelClick);
  const onRectDrawnRef = useRef(props.onRectDrawn);
  const flyToRef = useRef(props.flyTo);
  const fitToRef = useRef(props.fitTo);

  // Drag bookkeeping for the rubber-band rectangle.
  const dragStartRef = useRef<LngLat | null>(null);
  // A finished drag is followed by a browser `click`. Without this, that click would land
  // on `parcels-fill` and replace the freshly drawn multi-parcel selection with one parcel.
  const suppressClickRef = useRef(false);

  useEffect(() => {
    dataRef.current = props.data;
    bboxRef.current = props.bbox;
    selectedPinsRef.current = props.selectedPins;
    drawingRef.current = props.drawing;
    onParcelClickRef.current = props.onParcelClick;
    onRectDrawnRef.current = props.onRectDrawn;
    flyToRef.current = props.flyTo;
    fitToRef.current = props.fitTo;
  });

  // Map creation — exactly once. Never recreated when props change.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: KEYLESS_STYLE,
      center: [-90.56, 41.505],
      zoom: 13,
      // The built-in control is suppressed so the explicit `compact: false` one below is
      // the only attribution on the map. Two controls would duplicate the notice, and the
      // built-in one auto-collapses at narrow widths.
      attributionControl: false,
    });
    mapRef.current = map;

    // `compact: false` is mandatory, not cosmetic. OpenStreetMap's tile usage policy
    // requires attribution that is not hidden behind a toggle; `compact: true` collapses
    // it behind an "i" button at phone widths, which would breach the policy the keyless
    // basemap depends on.
    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution: "Parcels: Rock Island County GIS",
      }),
      "bottom-right",
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    const setRect = (ring: ReturnType<typeof rectRing>) => {
      map.getSource<maplibregl.GeoJSONSource>("draw-rect")?.setData({
        type: "Feature",
        properties: {},
        geometry: ringToGeoJsonPolygon(ring),
      });
    };

    const clearRect = () => {
      map.getSource<maplibregl.GeoJSONSource>("draw-rect")?.setData(EMPTY_COLLECTION);
    };

    const endDrawMode = () => {
      dragStartRef.current = null;
      clearRect();
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    };

    // Runs exactly once, whichever trigger below wins the race.
    let layersReady = false;

    const init = () => {
      if (layersReady) return;
      layersReady = true;
      loadedRef.current = true;

      map.addSource("parcels", {
        type: "geojson",
        data: dataRef.current,
        promoteId: "PIN",
      });

      map.addLayer({
        id: "parcels-fill",
        type: "fill",
        source: "parcels",
        paint: { "fill-color": "#94a3b8", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "parcels-line",
        type: "line",
        source: "parcels",
        paint: { "line-color": "#475569", "line-width": 0.5 },
      });
      map.addLayer({
        id: "parcels-selected-fill",
        type: "fill",
        source: "parcels",
        paint: { "fill-color": "#f97316", "fill-opacity": 0.55 },
        filter: selectionFilter([]),
      });
      map.addLayer({
        id: "parcels-selected-line",
        type: "line",
        source: "parcels",
        paint: { "line-color": "#c2410c", "line-width": 2 },
        filter: selectionFilter([]),
      });

      // The rubber band sits above the parcels so the drawn shape stays visible over them.
      map.addSource("draw-rect", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "draw-rect-fill",
        type: "fill",
        source: "draw-rect",
        paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "draw-rect-line",
        type: "line",
        source: "draw-rect",
        paint: { "line-color": "#0284c7", "line-width": 2, "line-dasharray": [2, 2] },
      });

      const bbox = bboxRef.current;
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 24, animate: false },
      );

      // A selection may already exist by the time the style finishes loading.
      const filter = selectionFilter(selectedPinsRef.current);
      map.setFilter("parcels-selected-fill", filter);
      map.setFilter("parcels-selected-line", filter);
    };

    // `load` is NOT "the style is ready" — it is "the style is ready AND every in-view tile
    // of every source has settled". A single stalled tile from the third-party OSM basemap
    // therefore blocks the parcel layers from ever being added, with no error logged: the
    // cached basemap paints, the parcels are silently absent, and `map.loaded()` stays
    // false forever. `style.load` fires as soon as the style JSON is parsed, which is all
    // `addSource`/`addLayer` actually require, so the parcels no longer depend on a tile
    // CDN we do not control. `load` is kept as an idempotent backstop; when tiles behave
    // normally it fires strictly after `style.load`, so behaviour is unchanged.
    map.once("style.load", init);
    map.once("load", init);

    map.on("click", "parcels-fill", (e) => {
      if (drawingRef.current) return;
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const pin = e.features?.[0]?.properties?.PIN;
      if (pin === null || pin === undefined) return;
      onParcelClickRef.current(String(pin));
    });

    map.on("mouseenter", "parcels-fill", () => {
      if (drawingRef.current) return;
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "parcels-fill", () => {
      if (drawingRef.current) return;
      map.getCanvas().style.cursor = "";
    });

    const startDrag = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      suppressClickRef.current = false;
      dragStartRef.current = { lng: e.lngLat.lng, lat: e.lngLat.lat };
    };

    const moveDrag = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      const a = dragStartRef.current;
      if (!drawingRef.current || !a) return;
      setRect(rectRing(a, { lng: e.lngLat.lng, lat: e.lngLat.lat }));
    };

    const endDrag = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      const a = dragStartRef.current;
      if (!drawingRef.current || !a) return;
      const b = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      endDrawMode();
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 400);
      onRectDrawnRef.current(a, b);
    };

    map.on("mousedown", startDrag);
    map.on("mousemove", moveDrag);
    map.on("mouseup", endDrag);
    map.on("touchstart", startDrag);
    map.on("touchmove", moveDrag);
    map.on("touchend", endDrag);

    return () => {
      loadedRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Draw mode on/off.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.drawing) {
      map.dragPan.disable();
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = "crosshair";
    } else {
      dragStartRef.current = null;
      map.getSource<maplibregl.GeoJSONSource>("draw-rect")?.setData(EMPTY_COLLECTION);
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    }
  }, [props.drawing]);

  // The highlight. One declarative filter call per layer, driven by the same array that
  // produces the on-screen count, so the highlighted set and the count cannot drift.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const filter = selectionFilter(props.selectedPins);
    map.setFilter("parcels-selected-fill", filter);
    map.setFilter("parcels-selected-line", filter);
  }, [props.selectedPins]);

  // `nonce` exists so asking for the same parcel twice still re-flies.
  const flyNonce = props.flyTo?.nonce;
  useEffect(() => {
    const map = mapRef.current;
    const target = flyToRef.current;
    if (!map || !target) return;
    map.flyTo({ center: [target.center.lng, target.center.lat], zoom: target.zoom });
  }, [flyNonce]);

  // Frames a reopened project's members. Modelled exactly on the `flyTo` effect above,
  // including the nonce-so-it-re-fires reason.
  const fitNonce = props.fitTo?.nonce;
  useEffect(() => {
    const map = mapRef.current;
    const target = fitToRef.current;
    if (!map || !target) return;
    const bbox = target.bbox;
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 48, maxZoom: 17, animate: false },
    );
  }, [fitNonce]);

  return (
    <div
      ref={containerRef}
      data-testid="parcel-map"
      className="h-[70vh] min-h-[360px] w-full overflow-hidden rounded-lg border border-black/10 dark:border-white/15"
    />
  );
}
