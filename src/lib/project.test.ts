import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import type { Parcel } from "@/lib/parcel";
import type { AdjacencyIndex } from "@/lib/adjacency";
import { computeProjectStats, contiguityLabel } from "@/lib/project";

function square(x: number, y: number): Geometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
        [x, y],
      ],
    ],
  };
}

function makeParcel(
  pin: string,
  overrides: Partial<Pick<Parcel, "geometry" | "acres" | "owner">> = {},
): Parcel {
  return {
    pin,
    owner: overrides.owner ?? { present: false },
    taxBillName: { present: false },
    assessedValue: { present: false },
    marketValue: { present: false },
    mailingStreet: { present: false },
    mailingCityStateZip: { present: false },
    acres: overrides.acres ?? { present: true, value: 1 },
    geometry: overrides.geometry ?? square(Number(pin.length), 0),
  };
}

describe("computeProjectStats", () => {
  it("sums three ordinary parcels the same way in both sums", () => {
    const a = makeParcel("A", { geometry: square(0, 0), acres: { present: true, value: 1 } });
    const b = makeParcel("B", { geometry: square(10, 0), acres: { present: true, value: 2 } });
    const c = makeParcel("C", { geometry: square(20, 0), acres: { present: true, value: 3 } });
    const parcelsByPin = new Map([
      ["A", a],
      ["B", b],
      ["C", c],
    ]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A", "B", "C"], parcelsByPin, index);

    expect(stats.combinedAcres).toBe(6);
    expect(stats.combinedAcres).toBe(stats.plainSumAcres);
    expect(stats.duplicateFootprintRecords).toBe(0);
  });

  it("counts a duplicate footprint's acreage once in combinedAcres but twice in plainSumAcres", () => {
    const geometry = square(0, 0);
    const a = makeParcel("A", { geometry, acres: { present: true, value: 10.457 } });
    const b = makeParcel("B", { geometry, acres: { present: true, value: 10.457 } });
    const parcelsByPin = new Map([
      ["A", a],
      ["B", b],
    ]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A", "B"], parcelsByPin, index);

    expect(stats.combinedAcres).toBeCloseTo(10.457, 6);
    expect(stats.plainSumAcres).toBeCloseTo(20.914, 6);
    expect(stats.duplicateFootprintRecords).toBe(1);
    expect(stats.duplicateFootprintGroups).toBe(1);
  });

  it("excludes a member with absent acreage from both sums", () => {
    const a = makeParcel("A", { acres: { present: false } });
    const parcelsByPin = new Map([["A", a]]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A"], parcelsByPin, index);

    expect(stats.combinedAcres).toBe(0);
    expect(stats.plainSumAcres).toBe(0);
    expect(stats.acreageMissingCount).toBe(1);
  });

  it("puts a pin absent from parcelsByPin into missingPins, not members", () => {
    const parcelsByPin = new Map<string, Parcel>();
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["Z"], parcelsByPin, index);

    expect(stats.missingPins).toEqual(["Z"]);
    expect(stats.members).toEqual([]);
  });

  it("reports 2 blocks for two adjacent members plus one detached member", () => {
    const a = makeParcel("A", { geometry: square(0, 0) });
    const b = makeParcel("B", { geometry: square(1, 0) });
    const c = makeParcel("C", { geometry: square(50, 50) });
    const parcelsByPin = new Map([
      ["A", a],
      ["B", b],
      ["C", c],
    ]);
    const index: AdjacencyIndex = new Map([
      ["A", new Set(["B"])],
      ["B", new Set(["A"])],
    ]);

    const stats = computeProjectStats(["A", "B", "C"], parcelsByPin, index);

    expect(stats.blocks.length).toBe(2);
  });

  it("counts distinct present owners and the members with an absent owner", () => {
    const a = makeParcel("A", { owner: { present: true, value: "A" } });
    const b = makeParcel("B", { owner: { present: true, value: "B" } });
    const c = makeParcel("C", { owner: { present: true, value: "A" } });
    const d = makeParcel("D", { owner: { present: false } });
    const parcelsByPin = new Map([
      ["A", a],
      ["B", b],
      ["C", c],
      ["D", d],
    ]);
    const index: AdjacencyIndex = new Map();

    const stats = computeProjectStats(["A", "B", "C", "D"], parcelsByPin, index);

    expect(stats.ownerCount).toBe(2);
    expect(stats.ownersMissingCount).toBe(1);
  });

  it("labels contiguity for 0, 1 and 3 blocks", () => {
    expect(contiguityLabel(0)).toBe("No parcels");
    expect(contiguityLabel(1)).toBe("1 connected block");
    expect(contiguityLabel(3)).toBe("3 separate blocks");
  });
});
