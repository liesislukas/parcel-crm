import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import type { Parcel } from "@/lib/parcel";
import { buildAdjacencyIndex, connectedBlocks } from "@/lib/adjacency";

function square(x: number, y: number): number[][][] {
  return [
    [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
      [x, y],
    ],
  ];
}

function makeParcel(pin: string, geometry: Geometry): Parcel {
  return {
    pin,
    owner: { present: false },
    taxBillName: { present: false },
    assessedValue: { present: false },
    marketValue: { present: false },
    mailingStreet: { present: false },
    mailingCityStateZip: { present: false },
    acres: { present: false },
    geometry,
  };
}

describe("buildAdjacencyIndex / connectedBlocks", () => {
  it("two unit squares sharing a full edge are adjacent both ways, and form 1 block", () => {
    const a = makeParcel("A", { type: "Polygon", coordinates: square(0, 0) });
    const b = makeParcel("B", { type: "Polygon", coordinates: square(1, 0) });
    const index = buildAdjacencyIndex([a, b]);

    expect(index.get("A")).toEqual(new Set(["B"]));
    expect(index.get("B")).toEqual(new Set(["A"]));

    const blocks = connectedBlocks(["A", "B"], index);
    expect(blocks).toEqual([["A", "B"]]);
  });

  it("two squares meeting at a single corner point only are not adjacent, and form 2 blocks", () => {
    const a = makeParcel("A", { type: "Polygon", coordinates: square(0, 0) });
    const b = makeParcel("B", { type: "Polygon", coordinates: square(1, 1) });
    const index = buildAdjacencyIndex([a, b]);

    expect(index.get("A") ?? new Set()).toEqual(new Set());
    expect(index.get("B") ?? new Set()).toEqual(new Set());

    const blocks = connectedBlocks(["A", "B"], index);
    expect(blocks).toEqual([["A"], ["B"]]);
  });

  it("two squares far apart form 2 blocks", () => {
    const a = makeParcel("A", { type: "Polygon", coordinates: square(0, 0) });
    const b = makeParcel("B", { type: "Polygon", coordinates: square(50, 50) });
    const index = buildAdjacencyIndex([a, b]);

    const blocks = connectedBlocks(["A", "B"], index);
    expect(blocks).toEqual([["A"], ["B"]]);
  });

  it("three squares in a row form 1 block of 3", () => {
    const a = makeParcel("A", { type: "Polygon", coordinates: square(0, 0) });
    const b = makeParcel("B", { type: "Polygon", coordinates: square(1, 0) });
    const c = makeParcel("C", { type: "Polygon", coordinates: square(2, 0) });
    const index = buildAdjacencyIndex([a, b, c]);

    const blocks = connectedBlocks(["A", "B", "C"], index);
    expect(blocks).toEqual([["A", "B", "C"]]);
  });

  it("a MultiPolygon parcel whose second polygon shares an edge with another parcel is adjacent", () => {
    const d = makeParcel("D", {
      type: "MultiPolygon",
      coordinates: [square(100, 100), square(1, 0)],
    });
    const e = makeParcel("E", { type: "Polygon", coordinates: square(0, 0) });
    const index = buildAdjacencyIndex([d, e]);

    expect(index.get("D")).toEqual(new Set(["E"]));
    expect(index.get("E")).toEqual(new Set(["D"]));
  });

  it("connectedBlocks(['A','C']) on an A-B-C chain returns 2 blocks because B is excluded", () => {
    const a = makeParcel("A", { type: "Polygon", coordinates: square(0, 0) });
    const b = makeParcel("B", { type: "Polygon", coordinates: square(1, 0) });
    const c = makeParcel("C", { type: "Polygon", coordinates: square(2, 0) });
    const index = buildAdjacencyIndex([a, b, c]);

    const blocks = connectedBlocks(["A", "C"], index);
    expect(blocks).toEqual([["A"], ["C"]]);
  });
});
