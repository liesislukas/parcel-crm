import type { Feature, FeatureCollection, Geometry } from "geojson";
import { toParcel, type Parcel, type RawParcelProperties } from "@/lib/parcel";
import type { ParcelMeta } from "@/lib/parcelData";
import {
  EXPORT_DATASETS,
  buildParcelRows,
  headerOf,
  type ExportDatasetId,
  type ExportScope,
} from "./datasets";

/**
 * This file is the ONLY coupling point to ISSUE-004 (projects), ISSUE-005 (owners), and
 * ISSUE-006 (campaigns). When those ship, only this file changes — `csv.ts`,
 * `datasets.ts`, `ExportPanel.tsx`, and every test stay untouched. Phase 1 (this build)
 * has none of those three modules merged: owners and campaign-activity are honestly
 * unavailable, and project scope is honestly unavailable. No placeholder data is ever
 * generated for any of the three.
 */

export type Availability = { available: true } | { available: false; reason: string };
export type BuiltDataset = { header: string[]; rows: string[][] };
export type ProjectOption = { id: string; name: string; slug: string };
export type ProjectOptions =
  { available: true; options: ProjectOption[] } | { available: false; reason: string };

/** Mirrors `MapWorkspace.tsx` lines 44–61: same fetch paths, same error string, so the
 * export can never disagree with the map about what parcel data is loaded. */
async function loadParcelSource(): Promise<{ parcels: Parcel[]; meta: ParcelMeta }> {
  const [dataResponse, metaResponse] = await Promise.all([
    fetch("/data/rock-island-parcels.json"),
    fetch("/data/rock-island-parcels.meta.json"),
  ]);
  if (!dataResponse.ok || !metaResponse.ok) throw new Error("parcel data fetch failed");
  const collection = (await dataResponse.json()) as FeatureCollection;
  const meta = (await metaResponse.json()) as ParcelMeta;
  const parcels = collection.features.map((feature) =>
    toParcel(feature as Feature<Geometry, RawParcelProperties>),
  );
  return { parcels, meta };
}

/**
 * Synchronous and does no fetching, so the page can render disabled cards instantly.
 * Phase 1: only "parcels" is available. The reason strings below are rendered verbatim
 * on screen — they are the honest gap statement, not a placeholder.
 */
export function datasetAvailability(id: ExportDatasetId): Availability {
  switch (id) {
    case "parcels":
      return { available: true };
    case "owners":
      return {
        available: false,
        reason:
          "Owner CRM records are not built yet (ISSUE-005). No owner export is available, and no placeholder owner data is generated.",
      };
    case "campaign-activity":
      return {
        available: false,
        reason:
          "Campaign activity is not built yet (ISSUE-006). No campaign export is available, and no placeholder activity is generated.",
      };
  }
}

/** Phase 1: projects are not built yet, so exports always cover all loaded parcels. */
export async function loadProjectOptions(): Promise<ProjectOptions> {
  return {
    available: false,
    reason: "Projects are not built yet (ISSUE-004). Exports cover all loaded parcels.",
  };
}

/**
 * The UI never calls this for a disabled card — `datasetAvailability` gates the button
 * itself — so the throw below is a guard, not a reachable path in phase 1.
 */
export async function buildDataset(
  id: ExportDatasetId,
  scope: ExportScope,
  generatedAt: string,
): Promise<BuiltDataset> {
  const availability = datasetAvailability(id);
  if (!availability.available) {
    throw new Error(availability.reason);
  }

  switch (id) {
    case "parcels": {
      const { parcels, meta } = await loadParcelSource();
      const dataset = EXPORT_DATASETS.find((d) => d.id === "parcels")!;
      return {
        header: headerOf(dataset),
        rows: buildParcelRows({
          parcels,
          meta,
          projectNamesByPin: new Map(),
          scope,
          generatedAt,
        }),
      };
    }
    default: {
      // Unreachable in phase 1: the guard above already threw for every dataset that is
      // not available, and only "parcels" is available. Kept explicit so a dataset added
      // to ExportDatasetId without a builder wired here fails loudly instead of silently
      // falling through.
      const fallback = datasetAvailability(id);
      throw new Error(
        fallback.available ? `no builder wired for dataset "${id}"` : fallback.reason,
      );
    }
  }
}
