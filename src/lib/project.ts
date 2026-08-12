import type { Parcel } from "@/lib/parcel";
import { connectedBlocks, type AdjacencyIndex } from "@/lib/adjacency";

/**
 * A saved project: a named, persisted group of parcel ids. Statistics (acreage, blocks,
 * owner count) are never stored — they are recomputed from the source data every time, so
 * they can never drift from the parcels the project actually points at.
 *
 * Members are ids (`String(OBJECTID)`), not PINs, because PIN is not unique county-wide.
 */
export type Project = {
  id: string; // crypto.randomUUID()
  name: string; // trimmed, 1..80 chars
  parcelIds: string[]; // member parcel ids, insertion order, deduplicated
  pins?: string[]; // LEGACY, read-only: v1 projects saved before ISSUE-013. Never written.
  createdAt: string; // ISO 8601, new Date().toISOString()
  updatedAt: string; // ISO 8601
};

export type ProjectStats = {
  members: Parcel[]; // resolved members, in `parcelIds` order
  missingIds: string[]; // ids not present in the loaded county records
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
 * Rock Island County files condominium and PUD units against the whole parcel outline: 2,079
 * of the county's 65,955 records sit in 403 duplicate-footprint groups, the largest 107 records
 * filed against one 10.4570-ac outline. Summing every record naively reports 1,118.90 ac for
 * a 10.46-ac site. `computeProjectStats` therefore sums acreage once per DISTINCT outline
 * (`combinedAcres`) and also reports the plain all-records sum (`plainSumAcres`) so the two
 * can be shown side by side whenever they differ — nothing hidden, nothing invented.
 *
 * `Parcel.footprint` is exact equality of the published coordinate array, hashed at extract
 * time by `scripts/fetch-parcels.mjs` and verified collision-free: the 65,955 records occupy
 * 64,279 distinct footprints, and the duplicates are byte-identical.
 */
export function computeProjectStats(
  parcelIds: readonly string[],
  parcelsById: ReadonlyMap<string, Parcel>,
  index: AdjacencyIndex,
): ProjectStats {
  const members: Parcel[] = [];
  const missingIds: string[] = [];

  for (const id of parcelIds) {
    const parcel = parcelsById.get(id);
    if (parcel) {
      members.push(parcel);
    } else {
      missingIds.push(id);
    }
  }

  const seenFootprints = new Set<string>();
  let combinedAcres = 0;
  let plainSumAcres = 0;
  let duplicateFootprintRecords = 0;
  let acreageMissingCount = 0;
  const footprintCounts = new Map<string, number>();

  for (const member of members) {
    const key = member.footprint;

    // The two records that publish an empty ring have no outline to compare, so they never
    // join a footprint group — `null` must not become a shared dedup bucket. Both carry
    // GIS_acres_num 0, so they land in acreageMissingCount below.
    if (key === null) {
      if (!member.acres.present) acreageMissingCount += 1;
      else plainSumAcres += member.acres.value;
      continue;
    }

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
    members.map((m) => m.id),
    index,
  );

  return {
    members,
    missingIds,
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
