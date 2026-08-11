import { describe, expect, it } from "vitest";
import { pointInRing, polygonCentroid, rectRing, ringToGeoJsonPolygon, type Ring } from "./geo";

const ring = (pts: [number, number][]): Ring => pts.map(([lng, lat]) => ({ lng, lat }));

const UNIT_SQUARE = rectRing({ lng: -1, lat: -1 }, { lng: 1, lat: 1 });

/**
 * The L-shape exactly as written in the plan: the full strip y 0..2 across x 0..4, plus
 * the upper-right block x 2..4, y 2..4. Its concave notch — inside the bounding box but
 * outside the polygon — is the upper LEFT quadrant, so (1,3) is the point that proves
 * this is a real ray cast and not a bbox test.
 */
const L_SHAPE = ring([
  [0, 0],
  [4, 0],
  [4, 4],
  [2, 4],
  [2, 2],
  [0, 2],
  [0, 0],
]);

/** The same L mirrored, so that its notch is the upper-RIGHT quadrant instead. */
const L_SHAPE_NOTCH_TOP_RIGHT = ring([
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
  [0, 0],
]);

describe("rectRing", () => {
  it("normalises the drag direction", () => {
    expect(rectRing({ lng: 1, lat: 1 }, { lng: -1, lat: -1 })).toEqual(
      rectRing({ lng: -1, lat: -1 }, { lng: 1, lat: 1 }),
    );
  });

  it("returns a closed ring of exactly 5 points, counter-clockwise from the south-west", () => {
    const r = rectRing({ lng: -1, lat: -1 }, { lng: 1, lat: 1 });
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual(r[4]);
    expect(r).toEqual([
      { lng: -1, lat: -1 },
      { lng: 1, lat: -1 },
      { lng: 1, lat: 1 },
      { lng: -1, lat: 1 },
      { lng: -1, lat: -1 },
    ]);
  });
});

describe("pointInRing", () => {
  it("accepts an interior point and rejects an exterior one", () => {
    expect(pointInRing({ lng: 0, lat: 0 }, UNIT_SQUARE)).toBe(true);
    expect(pointInRing({ lng: 2, lat: 0 }, UNIT_SQUARE)).toBe(false);
    expect(pointInRing({ lng: 0, lat: 2 }, UNIT_SQUARE)).toBe(false);
  });

  it("handles a concave ring, which a bounding-box test could not", () => {
    // Both points below are inside the [0,4] x [0,4] bounding box; only one is inside
    // the polygon. That difference is the whole point of the even-odd ray cast.
    expect(pointInRing({ lng: 1, lat: 1 }, L_SHAPE)).toBe(true);
    expect(pointInRing({ lng: 3, lat: 3 }, L_SHAPE)).toBe(true);
    expect(pointInRing({ lng: 1, lat: 3 }, L_SHAPE)).toBe(false);
  });

  it("handles the same concave ring mirrored, so the notch is the other quadrant", () => {
    expect(pointInRing({ lng: 1, lat: 1 }, L_SHAPE_NOTCH_TOP_RIGHT)).toBe(true);
    expect(pointInRing({ lng: 3, lat: 3 }, L_SHAPE_NOTCH_TOP_RIGHT)).toBe(false);
    expect(pointInRing({ lng: 1, lat: 3 }, L_SHAPE_NOTCH_TOP_RIGHT)).toBe(true);
  });
});

describe("polygonCentroid", () => {
  it("returns the shoelace centroid of a Polygon's outer ring", () => {
    const c = polygonCentroid({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    });
    expect(c.lng).toBeCloseTo(1, 9);
    expect(c.lat).toBeCloseTo(1, 9);
  });

  it("uses the outer ring with the most vertices in a MultiPolygon", () => {
    // First polygon is a 4-vertex triangle at the origin; second is a 5-vertex square
    // centred on (10, 10). The second has more vertices, so it must win.
    const c = polygonCentroid({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [9, 9],
            [11, 9],
            [11, 11],
            [9, 11],
            [9, 9],
          ],
        ],
      ],
    });
    expect(c.lng).toBeCloseTo(10, 9);
    expect(c.lat).toBeCloseTo(10, 9);
  });

  it("returns the first vertex of a degenerate, zero-area ring", () => {
    const c = polygonCentroid({
      type: "Polygon",
      coordinates: [
        [
          [5, 7],
          [5, 7],
          [5, 7],
          [5, 7],
        ],
      ],
    });
    expect(c).toEqual({ lng: 5, lat: 7 });
  });

  it("throws on an unsupported geometry type", () => {
    expect(() => polygonCentroid({ type: "Point", coordinates: [0, 0] })).toThrow(
      "unsupported geometry: Point",
    );
  });
});

describe("ringToGeoJsonPolygon", () => {
  it("converts a Ring to GeoJSON [[[lng, lat], ...]]", () => {
    expect(ringToGeoJsonPolygon(rectRing({ lng: -1, lat: -2 }, { lng: 3, lat: 4 }))).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [-1, -2],
          [3, -2],
          [3, 4],
          [-1, 4],
          [-1, -2],
        ],
      ],
    });
  });
});
