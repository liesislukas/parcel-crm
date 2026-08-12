"use client";

import Link from "next/link";

import type { ParcelMeta } from "@/lib/parcelData";

type SelectionSummaryProps = {
  count: number;
  meta: ParcelMeta;
  drawLimitMessage: string | null;
  onShowIncomplete: () => void;
};

/**
 * The honesty panel. Every number is interpolated from the committed meta file — nothing
 * here is hardcoded — and the scope lines are always visible rather than tucked behind a
 * disclosure, so a reviewer can see at a glance exactly what this build holds: the whole
 * county, and the two records inside it that the county publishes without an outline.
 */
export default function SelectionSummary({
  count,
  meta,
  drawLimitMessage,
  onShowIncomplete,
}: SelectionSummaryProps) {
  return (
    <div
      data-testid="selection-summary"
      className="mb-3 rounded-lg border border-black/10 p-3 text-xs leading-relaxed dark:border-white/15"
    >
      <p data-testid="selection-count" className="text-sm font-semibold">
        {count} parcel{count === 1 ? "" : "s"} selected
      </p>
      <p className="text-black/60 dark:text-white/60">
        Selected: parcels whose centre point falls inside the drawn shape.
      </p>
      <p className="text-black/60 dark:text-white/60">
        Click a parcel to add it to the selection — clicking never clears what you already have. Use
        Draw area, then drag a box, to replace the selection with everything inside it. Dragging
        without Draw area pans the map.
      </p>
      {drawLimitMessage !== null ? (
        <p data-testid="draw-limit" className="mt-2 font-semibold">
          {drawLimitMessage}
        </p>
      ) : null}
      <p className="mt-2 font-semibold">
        Full county coverage — {meta.parcelCount.toLocaleString("en-US")} of{" "}
        {meta.countyParcelCount.toLocaleString("en-US")} Rock Island County parcels loaded.
      </p>
      <p className="text-black/60 dark:text-white/60">
        {meta.mappedParcelCount.toLocaleString("en-US")} of these have a mapped outline and can be
        clicked, selected and grouped. {meta.unmappedPins.length} records publish an empty polygon
        ring at source and cannot be drawn or added to a project: PIN {meta.unmappedPins.join(", ")}
        . Their ownership, value and mailing fields are loaded and searchable.
      </p>
      <p className="text-black/60 dark:text-white/60">
        Source: {meta.sourceOrg} parcel layer (ArcGIS FeatureServer), full county extent{" "}
        {meta.bboxLabel}, retrieved {new Date(meta.retrievedAt).toISOString().slice(0, 10)}.
        Licence: {meta.sourceLicense}.{" "}
        <a href={meta.sourceLayerUrl} target="_blank" rel="noreferrer" className="underline">
          View source layer
        </a>{" "}
        <Link href="/sources" data-testid="banner-sources-link" className="underline">
          All data sources and gaps
        </Link>
      </p>
      <button
        type="button"
        data-testid="show-incomplete"
        onClick={onShowIncomplete}
        disabled={meta.incompletePins.length === 0}
        className="mt-2 rounded-md border border-black/20 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25"
      >
        Show a parcel with incomplete source data
      </button>
      <p className="text-black/60 dark:text-white/60">
        {meta.incompletePins.length} of the {meta.parcelCount.toLocaleString("en-US")} loaded
        parcels are missing at least one source field.
      </p>
    </div>
  );
}
