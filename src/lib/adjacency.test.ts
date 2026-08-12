import { describe, expect, it } from "vitest";
import { adjacencyFromRows, connectedBlocks } from "@/lib/adjacency";

/**
 * The segment-sharing algorithm itself now lives in `scripts/fetch-parcels.mjs` and runs once
 * at extract time; what ships in the browser is the loader for its output. These fixtures are
 * that output's shape: `rows[i]` = neighbour row indices of row `i`, index-aligned with `ids`.
 */
const CHAIN_IDS = ["A", "B", "C"];
// A—B—C in a row: A touches B, B touches A and C, C touches B.
const CHAIN_ROWS = [[1], [0, 2], [1]];

describe("adjacencyFromRows", () => {
  it("maps row indices back to parcel ids, both ways", () => {
    const index = adjacencyFromRows(CHAIN_IDS, CHAIN_ROWS);

    expect(index.get("A")).toEqual(new Set(["B"]));
    expect(index.get("B")).toEqual(new Set(["A", "C"]));
    expect(index.get("C")).toEqual(new Set(["B"]));
  });

  it("omits a parcel with no neighbours from the map entirely", () => {
    // 239 of the 65,953 mapped county parcels have no neighbour at all. connectedBlocks
    // falls back to an empty set, so they still form their own single-member block.
    const index = adjacencyFromRows(["A", "B"], [[], []]);

    expect(index.has("A")).toBe(false);
    expect(index.size).toBe(0);
    expect(connectedBlocks(["A", "B"], index)).toEqual([["A"], ["B"]]);
  });

  it("skips an out-of-range neighbour index rather than throwing", () => {
    const index = adjacencyFromRows(["A", "B"], [[1, 99], [0]]);

    expect(index.get("A")).toEqual(new Set(["B"]));
    expect(index.get("B")).toEqual(new Set(["A"]));
  });
});

describe("connectedBlocks", () => {
  it("two parcels sharing a full edge form 1 block", () => {
    const index = adjacencyFromRows(["A", "B"], [[1], [0]]);

    expect(connectedBlocks(["A", "B"], index)).toEqual([["A", "B"]]);
  });

  it("two parcels meeting at a single corner point only form 2 blocks", () => {
    // A shared corner is not adjacency, so the extract records no neighbours for either.
    const index = adjacencyFromRows(["A", "B"], [[], []]);

    expect(index.get("A") ?? new Set()).toEqual(new Set());
    expect(index.get("B") ?? new Set()).toEqual(new Set());
    expect(connectedBlocks(["A", "B"], index)).toEqual([["A"], ["B"]]);
  });

  it("two parcels far apart form 2 blocks", () => {
    const index = adjacencyFromRows(["A", "B"], [[], []]);

    expect(connectedBlocks(["A", "B"], index)).toEqual([["A"], ["B"]]);
  });

  it("three parcels in a row form 1 block of 3", () => {
    const index = adjacencyFromRows(CHAIN_IDS, CHAIN_ROWS);

    expect(connectedBlocks(["A", "B", "C"], index)).toEqual([["A", "B", "C"]]);
  });

  it("connectedBlocks(['A','C']) on an A-B-C chain returns 2 blocks because B is excluded", () => {
    const index = adjacencyFromRows(CHAIN_IDS, CHAIN_ROWS);

    expect(connectedBlocks(["A", "C"], index)).toEqual([["A"], ["C"]]);
  });
});
