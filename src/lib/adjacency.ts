import type { Geometry } from "geojson";
import type { Parcel } from "@/lib/parcel";

/**
 * Adjacent = the two outlines share at least one identical boundary segment at the source's
 * 6-decimal precision. A single shared corner vertex is not adjacency. Measured over the 6,026-parcel
 * Rock Island working subset: 18,334 adjacent pairs, 99.4% of parcels with at least one neighbour,
 * 140 corner-only pairs correctly excluded, and exactly 1 pair that shares two vertices without
 * sharing a segment — so a tolerance-based rule would add false positives and fix nothing.
 */
export type AdjacencyIndex = ReadonlyMap<string, ReadonlySet<string>>;

const EMPTY_NEIGHBOURS: ReadonlySet<string> = new Set();

/**
 * Rings contributing boundary segments for a geometry. Polygon → its own coordinate rings
 * (exterior + holes). MultiPolygon → every ring of every part, flattened. Holes are included
 * because they are real shared boundaries. Any other geometry type contributes no segments.
 */
function ringsOf(geometry: Geometry): number[][][] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

/**
 * Undirected key for the segment between two consecutive ring vertices, compared at the
 * source's 6-decimal precision. Returns null for a zero-length segment (a duplicated vertex).
 */
function segmentKey(p1: number[], p2: number[]): string | null {
  const a = p1[0].toFixed(6) + "," + p1[1].toFixed(6);
  const b = p2[0].toFixed(6) + "," + p2[1].toFixed(6);
  if (a === b) return null;
  return a < b ? a + "|" + b : b + "|" + a;
}

export function buildAdjacencyIndex(parcels: readonly Parcel[]): AdjacencyIndex {
  const segmentOwners = new Map<string, Set<string>>();

  for (const parcel of parcels) {
    const rings = ringsOf(parcel.geometry);
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const key = segmentKey(ring[i], ring[i + 1]);
        if (key === null) continue;
        let owners = segmentOwners.get(key);
        if (!owners) {
          owners = new Set();
          segmentOwners.set(key, owners);
        }
        owners.add(parcel.pin);
      }
    }
  }

  const neighbours = new Map<string, Set<string>>();
  for (const owners of segmentOwners.values()) {
    if (owners.size < 2) continue;
    const pins = [...owners];
    for (const pin of pins) {
      let set = neighbours.get(pin);
      if (!set) {
        set = new Set();
        neighbours.set(pin, set);
      }
      for (const other of pins) {
        if (other !== pin) set.add(other);
      }
    }
  }

  return neighbours;
}

/**
 * A depth-first walk restricted to the supplied `pins`, ignoring neighbours outside it.
 * Duplicate pins in the input are collapsed. Output is deterministic: each block's pins
 * sorted ascending, blocks sorted by size descending then by first pin ascending. A pin
 * with no neighbours inside the set is its own single-member block.
 */
export function connectedBlocks(pins: readonly string[], index: AdjacencyIndex): string[][] {
  const set = new Set(pins);
  const visited = new Set<string>();
  const blocks: string[][] = [];

  for (const start of set) {
    if (visited.has(start)) continue;
    const block: string[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const pin = stack.pop()!;
      block.push(pin);
      const neighbours = index.get(pin) ?? EMPTY_NEIGHBOURS;
      for (const neighbour of neighbours) {
        if (set.has(neighbour) && !visited.has(neighbour)) {
          visited.add(neighbour);
          stack.push(neighbour);
        }
      }
    }
    block.sort();
    blocks.push(block);
  }

  blocks.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return blocks;
}
