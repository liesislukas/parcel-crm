import { describe, expect, it } from "vitest";
import {
  distanceMetres,
  distanceToSegmentMetres,
  formatDistance,
  nearestPowerFeature,
  powerFeatureLabel,
  toPowerFeature,
  type PowerFeature,
  type RawPowerProperties,
} from "@/lib/power";
import type { Feature, Geometry } from "geojson";

const substationFeature: Feature<Geometry, RawPowerProperties> = {
  type: "Feature",
  id: "way/253858380",
  geometry: { type: "Point", coordinates: [-90.567501, 41.510697] },
  properties: {
    kind: "substation",
    osmId: "way/253858380",
    osmUrl: "https://www.openstreetmap.org/way/253858380",
    name: null,
    operator: null,
    voltage: null,
    substationType: null,
    cables: null,
  },
};

const lineFeature: Feature<Geometry, RawPowerProperties> = {
  type: "Feature",
  id: "way/1",
  geometry: {
    type: "LineString",
    coordinates: [
      [-90.6, 41.5],
      [-90.5, 41.51],
    ],
  },
  properties: {
    kind: "transmission-line",
    osmId: "way/1",
    osmUrl: "https://www.openstreetmap.org/way/1",
    name: null,
    operator: null,
    voltage: "161000",
    substationType: null,
    cables: "3",
  },
};

describe("toPowerFeature", () => {
  it("maps a substation Point feature", () => {
    const f = toPowerFeature(substationFeature);
    expect(f.kind).toBe("substation");
    expect(f.osmId).toBe("way/253858380");
    expect(f.point).toEqual({ lng: -90.567501, lat: 41.510697 });
    expect(f.path).toBeNull();
    expect(f.name).toEqual({ present: false });
    expect(f.operator).toEqual({ present: false });
    expect(f.voltage).toEqual({ present: false });
  });

  it("maps a LineString feature", () => {
    const f = toPowerFeature(lineFeature);
    expect(f.path).toEqual([
      { lng: -90.6, lat: 41.5 },
      { lng: -90.5, lat: 41.51 },
    ]);
    expect(f.point).toBeNull();
    expect(f.voltage).toEqual({ present: true, value: "161000" });
  });

  it("treats a single-space voltage as absent", () => {
    const f = toPowerFeature({
      ...lineFeature,
      properties: { ...lineFeature.properties, voltage: " " },
    });
    expect(f.voltage).toEqual({ present: false });
  });

  it("throws on an unsupported kind", () => {
    expect(() =>
      toPowerFeature({
        ...substationFeature,
        properties: { ...substationFeature.properties, kind: "pylon" },
      }),
    ).toThrow(/unsupported power kind/);
  });
});

describe("distanceMetres", () => {
  it("measures 0.01° of longitude at 41.505°N", () => {
    expect(distanceMetres({ lng: -90.56, lat: 41.505 }, { lng: -90.55, lat: 41.505 })).toBeCloseTo(
      833.67,
      0.5,
    );
  });

  it("measures 0.01° of latitude", () => {
    expect(distanceMetres({ lng: -90.56, lat: 41.505 }, { lng: -90.56, lat: 41.515 })).toBeCloseTo(
      1113.2,
      0.5,
    );
  });
});

describe("distanceToSegmentMetres", () => {
  it("returns the perpendicular distance, not an endpoint distance", () => {
    const d = distanceToSegmentMetres(
      { lng: -90.55, lat: 41.51 },
      { lng: -90.6, lat: 41.5 },
      { lng: -90.5, lat: 41.5 },
    );
    expect(d).toBeCloseTo(1113.2, 0.5);
  });

  it("clamps to the far endpoint when the projection falls outside the segment", () => {
    const d = distanceToSegmentMetres(
      { lng: -90.4, lat: 41.5 },
      { lng: -90.6, lat: 41.5 },
      { lng: -90.5, lat: 41.5 },
    );
    expect(d).toBeCloseTo(8337.38, 1);
  });
});

describe("nearestPowerFeature", () => {
  const near: PowerFeature = {
    kind: "substation",
    osmId: "way/near",
    osmUrl: "https://www.openstreetmap.org/way/near",
    name: { present: false },
    operator: { present: false },
    voltage: { present: false },
    substationType: { present: false },
    cables: { present: false },
    point: { lng: -90.55, lat: 41.5 },
    path: null,
  };
  const far: PowerFeature = {
    ...near,
    osmId: "way/far",
    osmUrl: "https://www.openstreetmap.org/way/far",
    point: { lng: -90.4, lat: 41.5 },
  };

  it("returns the closer pair and the achieving origin's pin", () => {
    const origins = [
      { pin: "A", centre: { lng: -90.9, lat: 41.5 } },
      { pin: "B", centre: { lng: -90.551, lat: 41.5 } },
    ];
    const result = nearestPowerFeature(origins, [near, far], "substation");
    expect(result).not.toBeNull();
    expect(result!.feature.osmId).toBe("way/near");
    expect(result!.fromPin).toBe("B");
  });

  it("returns null when no feature has the requested kind", () => {
    const origins = [{ pin: "A", centre: { lng: -90.55, lat: 41.5 } }];
    const result = nearestPowerFeature(origins, [near, far], "transmission-line");
    expect(result).toBeNull();
  });
});

describe("formatDistance", () => {
  it("formats 891 metres and 1609.344 metres (one mile)", () => {
    expect(formatDistance(891)).toBe("0.89 km (0.55 mi)");
    expect(formatDistance(1609.344)).toBe("1.61 km (1.00 mi)");
  });
});

describe("powerFeatureLabel", () => {
  const base: PowerFeature = {
    kind: "substation",
    osmId: "way/253858380",
    osmUrl: "https://www.openstreetmap.org/way/253858380",
    name: { present: false },
    operator: { present: false },
    voltage: { present: false },
    substationType: { present: false },
    cables: { present: false },
    point: { lng: -90.567501, lat: 41.510697 },
    path: null,
  };

  it("returns the name when present, the operator form when only the operator is present, and the unnamed OSM-id fallback when neither is", () => {
    expect(powerFeatureLabel({ ...base, name: { present: true, value: "Main St" } })).toBe(
      "Main St",
    );
    expect(powerFeatureLabel({ ...base, operator: { present: true, value: "MidAmerican" } })).toBe(
      "MidAmerican substation",
    );
    expect(powerFeatureLabel(base)).toBe("Unnamed substation (OpenStreetMap way/253858380)");
  });
});
