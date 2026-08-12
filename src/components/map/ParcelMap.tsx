"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import { Protocol } from "pmtiles";
import { rectRing, ringToGeoJsonPolygon, type LngLat } from "@/lib/geo";

type ParcelMapProps = {
  tiles: { path: string; layer: string; idProperty: string };
  bbox: [number, number, number, number];
  selectedIds: string[];
  drawing: boolean;
  onParcelClick: (id: string) => void;
  onRectDrawn: (a: LngLat, b: LngLat) => void;
  flyTo: { center: LngLat; zoom: number; nonce: number } | null;
  fitTo: { bbox: [number, number, number, number]; nonce: number } | null;
  power: FeatureCollection | null;
  powerVisible: boolean;
  fitBbox: { bbox: [number, number, number, number]; nonce: number } | null;
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

/**
 * maplibre-gl@6.3.0 has no native PMTiles support — the only `pmtiles` string in its type
 * definitions is a documentation link. `addProtocol` is the supported extension point, and
 * `pmtiles@4.5.0` supplies the reader that answers those requests with HTTP Range fetches
 * against the single committed 15.8 MB archive.
 */
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

export default function ParcelMap(props: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);

  // Props read from inside MapLibre's own event handlers. The map is created exactly once
  // in a `[]`-deps effect, so every handler would otherwise close over the first render's
  // props forever. Refs updated after each commit keep them current without ever
  // recreating the map.
  const tilesRef = useRef(props.tiles);
  const bboxRef = useRef(props.bbox);
  // What the map currently has flagged, so the selection effect only writes the difference.
  const selectedIdsRef = useRef<Set<string>>(new Set());
  // What the props currently ask for, read by `init` when a selection predates style.load.
  const wantedIdsRef = useRef(props.selectedIds);
  const drawingRef = useRef(props.drawing);
  const onParcelClickRef = useRef(props.onParcelClick);
  const onRectDrawnRef = useRef(props.onRectDrawn);
  const flyToRef = useRef(props.flyTo);
  const fitToRef = useRef(props.fitTo);
  const powerRef = useRef(props.power);
  const powerVisibleRef = useRef(props.powerVisible);
  const fitBboxRef = useRef(props.fitBbox);

  // Drag bookkeeping for the rubber-band rectangle.
  const dragStartRef = useRef<LngLat | null>(null);
  // A finished drag is followed by a browser `click`. Without this, that click would land
  // on `parcels-fill` and replace the freshly drawn multi-parcel selection with one parcel.
  const suppressClickRef = useRef(false);

  useEffect(() => {
    tilesRef.current = props.tiles;
    bboxRef.current = props.bbox;
    wantedIdsRef.current = props.selectedIds;
    drawingRef.current = props.drawing;
    onParcelClickRef.current = props.onParcelClick;
    onRectDrawnRef.current = props.onRectDrawn;
    flyToRef.current = props.flyTo;
    fitToRef.current = props.fitTo;
    powerRef.current = props.power;
    powerVisibleRef.current = props.powerVisible;
    fitBboxRef.current = props.fitBbox;
  });

  // Map creation — exactly once. Never recreated when props change.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: KEYLESS_STYLE,
      // County centre and a county-scale zoom, so the very first paint is already the whole
      // county rather than one neighbourhood; `fitBounds` below then frames it exactly.
      center: [-90.6148, 41.5485],
      zoom: 9,
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
        customAttribution:
          "Parcels: Rock Island County GIS · Power: © OpenStreetMap contributors (ODbL)",
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

      const tiles = tilesRef.current;

      // All 65,953 mapped parcels, as vector tiles read straight from the committed archive.
      // `promoteId` lifts the numeric OBJECTID out of the properties into the feature id,
      // which is what makes feature-state highlighting possible.
      map.addSource("parcels", {
        type: "vector",
        url: `pmtiles://${tiles.path}`,
        promoteId: { [tiles.layer]: tiles.idProperty },
      });

      // The highlight rides on feature-state rather than on two extra filtered layers. A
      // filter of the form ["in", ["get","PIN"], ["literal", ids]] is O(selected x features)
      // and stalls at county scale; feature-state is a per-feature flag MapLibre keeps for
      // the source and re-applies to tiles that load later, so panning keeps the highlight.
      map.addLayer({
        id: "parcels-fill",
        type: "fill",
        source: "parcels",
        "source-layer": tiles.layer,
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#f97316",
            "#94a3b8",
          ],
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.55, 0.25],
        },
      });
      map.addLayer({
        id: "parcels-line",
        type: "line",
        source: "parcels",
        "source-layer": tiles.layer,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#c2410c",
            "#475569",
          ],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, 0.5],
        },
      });

      // Power infrastructure sits above the parcels and below the rubber band, so the
      // drawn rectangle is never occluded. Added with an empty collection when the fetch
      // has not landed yet, deliberately — it removes any ordering dependency between the
      // power fetch and `style.load`.
      map.addSource("power", { type: "geojson", data: powerRef.current ?? EMPTY_COLLECTION });
      map.addLayer({
        id: "power-lines",
        type: "line",
        source: "power",
        filter: ["==", ["get", "kind"], "transmission-line"],
        layout: {
          visibility: powerVisibleRef.current ? "visible" : "none",
          "line-cap": "round",
          "line-join": "round",
        },
        paint: { "line-color": "#7c3aed", "line-width": 2.5, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "power-substations",
        type: "circle",
        source: "power",
        filter: ["==", ["get", "kind"], "substation"],
        layout: { visibility: powerVisibleRef.current ? "visible" : "none" },
        paint: {
          "circle-radius": 6,
          "circle-color": "#7c3aed",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
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
      for (const id of wantedIdsRef.current) {
        map.setFeatureState(
          { source: "parcels", sourceLayer: tiles.layer, id: Number(id) },
          { selected: true },
        );
        selectedIdsRef.current.add(id);
      }

      // Proof, from the DOM, that the power layers were actually created — a silently
      // absent layer paints a healthy map and logs nothing (the defect class recorded in
      // ISSUE-003). The browser lane in test/browser/power.spec.ts asserts on this.
      container.dataset.powerLayers =
        map.getLayer("power-substations") && map.getLayer("power-lines") ? "ready" : "missing";
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
      const feature = e.features?.[0];
      const id = feature?.id ?? feature?.properties?.id;
      if (id === null || id === undefined) return;
      onParcelClickRef.current(String(id));
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

  // The highlight. Driven by the same array that produces the on-screen count, so the
  // highlighted set and the count cannot drift. Only the difference is written: ids are
  // flagged as they are added and cleared as they are removed. The tile ids are numbers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const sourceLayer = props.tiles.layer;
    const next = new Set(props.selectedIds);
    const previous = selectedIdsRef.current;

    for (const id of next) {
      if (previous.has(id)) continue;
      map.setFeatureState({ source: "parcels", sourceLayer, id: Number(id) }, { selected: true });
    }
    for (const id of previous) {
      if (next.has(id)) continue;
      map.removeFeatureState({ source: "parcels", sourceLayer, id: Number(id) }, "selected");
    }

    selectedIdsRef.current = next;
  }, [props.selectedIds, props.tiles.layer]);

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

  // The power snapshot may land after the map is already up.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.getSource<maplibregl.GeoJSONSource>("power")?.setData(props.power ?? EMPTY_COLLECTION);
  }, [props.power]);

  // The overlay toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const v = props.powerVisible ? "visible" : "none";
    map.setLayoutProperty("power-lines", "visibility", v);
    map.setLayoutProperty("power-substations", "visibility", v);
  }, [props.powerVisible]);

  // `nonce` exists so asking for the same box twice still re-fits, following the `flyNonce`
  // pattern above.
  const powerFitNonce = props.fitBbox?.nonce;
  useEffect(() => {
    const map = mapRef.current;
    const t = fitBboxRef.current;
    if (!map || !t) return;
    map.fitBounds(
      [
        [t.bbox[0], t.bbox[1]],
        [t.bbox[2], t.bbox[3]],
      ],
      { padding: 24 },
    );
  }, [powerFitNonce]);

  return (
    <div
      ref={containerRef}
      data-testid="parcel-map"
      className="h-[70vh] min-h-[360px] w-full overflow-hidden rounded-lg border border-black/10 dark:border-white/15"
    />
  );
}
