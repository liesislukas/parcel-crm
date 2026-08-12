import { describe, expect, it } from "vitest";
import type { Parcel } from "@/lib/parcel";
import type { AdjacencyIndex } from "@/lib/adjacency";
import { computeProjectStats, contiguityLabel } from "@/lib/project";

/**
 * Members are keyed by id (`String(OBJECTID)`); `footprint` is the precomputed FNV-1a32 hex
 * of the published coordinate array, so two records filed against one outline share a string.
 */
function makeParcel(
  id: string,
  overrides: Partial<Pick<Parcel, "footprint" | "acres" | "owner" | "centroid">> = {},
): Parcel {
  return {
    id,
    pin: `PIN-${id}`,
    owner: overrides.owner ?? { present: false },
    taxBillName: { present: false },
    assessedValue: { present: false },
    marketValue: { present: false },
    mailingStreet: { present: false },
    mailingCityStateZip: { present: false },
    acres: overrides.acres ?? { present: true, value: 1 },
    centroid: overrides.centroid === undefined ? { lng: -90.5, lat: 41.5 } : overrides.centroid,
    footprint: overrides.footprint === undefined ? `fp-${id}` : overrides.footprint,
  };
}

describe("computeProjectStats", () => {
  it("sums three ordinary parcels the same way in both sums", () => {
    const a = makeParcel("A", { acres: { present: true, value: 1 } });
    const b = makeParcel("B", { acres: { present: true, value: 2 } });
    const c = makeParcel("C", { acres: { present: true, value: 3 } });
    const parcelsById = new Map([
      ["A", a],
      ["B", b],
      ["C", c],
    ]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A", "B", "C"], parcelsById, index);

    expect(stats.combinedAcres).toBe(6);
    expect(stats.combinedAcres).toBe(stats.plainSumAcres);
    expect(stats.duplicateFootprintRecords).toBe(0);
  });

  it("counts a duplicate footprint's acreage once in combinedAcres but twice in plainSumAcres", () => {
    const a = makeParcel("A", { footprint: "9c4e21af", acres: { present: true, value: 10.457 } });
    const b = makeParcel("B", { footprint: "9c4e21af", acres: { present: true, value: 10.457 } });
    const parcelsById = new Map([
      ["A", a],
      ["B", b],
    ]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A", "B"], parcelsById, index);

    expect(stats.combinedAcres).toBeCloseTo(10.457, 6);
    expect(stats.plainSumAcres).toBeCloseTo(20.914, 6);
    expect(stats.duplicateFootprintRecords).toBe(1);
    expect(stats.duplicateFootprintGroups).toBe(1);
  });

  it("excludes a member with absent acreage from both sums", () => {
    const a = makeParcel("A", { acres: { present: false } });
    const parcelsById = new Map([["A", a]]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A"], parcelsById, index);

    expect(stats.combinedAcres).toBe(0);
    expect(stats.plainSumAcres).toBe(0);
    expect(stats.acreageMissingCount).toBe(1);
  });

  it("counts an outline-less record in acreageMissingCount and in no footprint group", () => {
    // PINs 1710408032 and 1710408043 publish an empty ring: no footprint, GIS_acres_num 0.
    // Two of them must not collapse into one shared `null` dedup bucket.
    const a = makeParcel("A", { footprint: null, centroid: null, acres: { present: false } });
    const b = makeParcel("B", { footprint: null, centroid: null, acres: { present: false } });
    const parcelsById = new Map([
      ["A", a],
      ["B", b],
    ]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A", "B"], parcelsById, index);

    expect(stats.acreageMissingCount).toBe(2);
    expect(stats.duplicateFootprintRecords).toBe(0);
    expect(stats.duplicateFootprintGroups).toBe(0);
    expect(stats.combinedAcres).toBe(0);
  });

  it("puts an id absent from parcelsById into missingIds, not members", () => {
    const parcelsById = new Map<string, Parcel>();
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["Z"], parcelsById, index);

    expect(stats.missingIds).toEqual(["Z"]);
    expect(stats.members).toEqual([]);
  });

  it("reports 2 blocks for two adjacent members plus one detached member", () => {
    const a = makeParcel("A");
    const b = makeParcel("B");
    const c = makeParcel("C");
    const parcelsById = new Map([
      ["A", a],
      ["B", b],
      ["C", c],
    ]);
    const index: AdjacencyIndex = new Map([
      ["A", new Set(["B"])],
      ["B", new Set(["A"])],
    ]);

    const stats = computeProjectStats(["A", "B", "C"], parcelsById, index);

    expect(stats.blocks.length).toBe(2);
  });

  it("counts distinct present owners and the members with an absent owner", () => {
    const a = makeParcel("A", { owner: { present: true, value: "A" } });
    const b = makeParcel("B", { owner: { present: true, value: "B" } });
    const c = makeParcel("C", { owner: { present: true, value: "A" } });
    const d = makeParcel("D", { owner: { present: false } });
    const parcelsById = new Map([
      ["A", a],
      ["B", b],
      ["C", c],
      ["D", d],
    ]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A", "B", "C", "D"], parcelsById, index);

    expect(stats.ownerCount).toBe(2);
    expect(stats.ownersMissingCount).toBe(1);
  });

  it("labels contiguity for 0, 1 and 3 blocks", () => {
    expect(contiguityLabel(0)).toBe("No parcels");
    expect(contiguityLabel(1)).toBe("1 connected block");
    expect(contiguityLabel(3)).toBe("3 separate blocks");
  });
});
