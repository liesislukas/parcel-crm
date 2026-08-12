import type { Geometry } from "geojson";
import type { Parcel } from "@/lib/parcel";
import { connectedBlocks, type AdjacencyIndex } from "@/lib/adjacency";

/**
 * A saved project: a named, persisted group of parcel PINs. Statistics (acreage, blocks,
 * owner count) are never stored — they are recomputed from the source data every time, so
 * they can never drift from the parcels the project actually points at.
 */
export type Project = {
  id: string; // crypto.randomUUID()
  name: string; // trimmed, 1..80 chars
  pins: string[]; // member PINs, insertion order, deduplicated
  createdAt: string; // ISO 8601, new Date().toISOString()
  updatedAt: string; // ISO 8601
};

export type ProjectStats = {
  members: Parcel[]; // resolved members, in `pins` order
  missingPins: string[]; // pins not in the loaded subset
  combinedAcres: number; // sum over DISTINCT footprints, present acreage only
  plainSumAcres: number; // sum over EVERY member with present acreage
  duplicateFootprintRecords: number; // members skipped as repeat footprints
  duplicateFootprintGroups: number; // footprints carrying more than one member
  acreageMissingCount: number; // members whose `acres` FieldState is absent
  blocks: string[][]; // from connectedBlocks, deterministic order
  ownerCount: number; // distinct present owner strings
  ownersMissingCount: number; // members with an absent owner
};

/**
 * Rock Island County files condominium and PUD units against the whole parcel outline: 303
 * of the loaded 6,026 parcels sit in 18 duplicate-footprint groups, the largest 107 records
 * filed against one 10.4570-ac outline. Summing every record naively reports 1,118.90 ac for
 * a 10.46-ac site. `computeProjectStats` therefore sums acreage once per DISTINCT outline
 * (`combinedAcres`) and also reports the plain all-records sum (`plainSumAcres`) so the two
 * can be shown side by side whenever they differ — nothing hidden, nothing invented.
 *
 * `footprintKey` is exact equality of the published coordinate array: the 6,026 features
 * occupy 5,741 distinct footprints, and the duplicates are byte-identical.
 */
export function footprintKey(geometry: Geometry): string {
  // Every geometry type in the loaded subset is Polygon or MultiPolygon, both of which carry
  // `coordinates`; the `in` check only exists to satisfy `Geometry` including
  // `GeometryCollection`, which this subset never contains.
  if ("coordinates" in geometry) return JSON.stringify(geometry.coordinates);
  return JSON.stringify(geometry);
}

export function computeProjectStats(
  pins: readonly string[],
  parcelsByPin: ReadonlyMap<string, Parcel>,
  index: AdjacencyIndex,
): ProjectStats {
  const members: Parcel[] = [];
  const missingPins: string[] = [];

  for (const pin of pins) {
    const parcel = parcelsByPin.get(pin);
    if (parcel) {
      members.push(parcel);
    } else {
      missingPins.push(pin);
    }
  }

  const seenFootprints = new Set<string>();
  let combinedAcres = 0;
  let plainSumAcres = 0;
  let duplicateFootprintRecords = 0;
  let acreageMissingCount = 0;
  const footprintCounts = new Map<string, number>();

  for (const member of members) {
    const key = footprintKey(member.geometry);
    footprintCounts.set(key, (footprintCounts.get(key) ?? 0) + 1);

    if (!member.acres.present) {
      acreageMissingCount += 1;
      continue;
    }

    plainSumAcres += member.acres.value;

    if (seenFootprints.has(key)) {
      duplicateFootprintRecords += 1;
    } else {
      seenFootprints.add(key);
      combinedAcres += member.acres.value;
    }
  }

  let duplicateFootprintGroups = 0;
  for (const count of footprintCounts.values()) {
    if (count > 1) duplicateFootprintGroups += 1;
  }

  const ownerValues = new Set<string>();
  let ownersMissingCount = 0;
  for (const member of members) {
    if (member.owner.present) {
      ownerValues.add(member.owner.value);
    } else {
      ownersMissingCount += 1;
    }
  }

  const blocks = connectedBlocks(
    members.map((m) => m.pin),
    index,
  );

  return {
    members,
    missingPins,
    combinedAcres,
    plainSumAcres,
    duplicateFootprintRecords,
    duplicateFootprintGroups,
    acreageMissingCount,
    blocks,
    ownerCount: ownerValues.size,
    ownersMissingCount,
  };
}

export function contiguityLabel(blockCount: number): string {
  if (blockCount === 0) return "No parcels";
  if (blockCount === 1) return "1 connected block";
  return `${blockCount} separate blocks`;
}
