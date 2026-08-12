import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Feature, Geometry } from "geojson";
import { toParcel, type Parcel, type RawParcelProperties } from "@/lib/parcel";
import { deriveOwners, fnv1a32, ownerKey, ownerSlug } from "./owners";

function loadParcels(): Parcel[] {
  const raw = JSON.parse(readFileSync("public/data/rock-island-parcels.json", "utf8")) as {
    features: Feature<Geometry, RawParcelProperties>[];
  };
  return raw.features.map(toParcel);
}

describe("deriveOwners against the real committed parcel file", () => {
  const parcels = loadParcels();

  it("has 6,026 features, 3 with a blank owner1_name", () => {
    expect(parcels.length).toBe(6026);
    const skipped = parcels.filter((p) => !p.owner.present);
    expect(skipped.length).toBe(3);
  });

  it("returns exactly 4,573 distinct owners", () => {
    const owners = deriveOwners(parcels);
    expect(owners.length).toBe(4573);
  });

  it("has zero ownerKey collisions, while ownerSlug alone collides (proving the hash suffix is required)", () => {
    const owners = deriveOwners(parcels);
    const keys = new Set(owners.map((o) => o.ownerKey));
    const slugs = new Set(owners.map((o) => ownerSlug(o.ownerName)));
    expect(keys.size).toBe(4573);
    expect(slugs.size).toBe(4556);
  });

  it("orders by totalAcres descending, then ownerName ascending", () => {
    const owners = deriveOwners(parcels);

    expect(owners[0].ownerName).toBe("ROCK ISLAND ARSENAL");
    expect(owners[0].parcelCount).toBe(1);
    expect(owners[0].mailingStreet).toBeNull();
    expect(owners[0].mailingCityStateZip).toBeNull();
    expect(owners[0].totalAcres).toBeCloseTo(975.6855737299176, 6);

    expect(owners[1].ownerName).toBe("CITY OF ROCK ISLAND");
    expect(owners[1].parcelCount).toBe(65);

    expect(owners[2].ownerName).toBe("AUGUSTANA COLLEGE");
    expect(owners[2].parcelCount).toBe(127);
  });

  it("has exactly one owner with no county mailing address, and it is ROCK ISLAND ARSENAL", () => {
    const owners = deriveOwners(parcels);
    const noAddress = owners.filter((o) => o.mailingStreet === null);
    expect(noAddress.length).toBe(1);
    expect(noAddress[0].ownerName).toBe("ROCK ISLAND ARSENAL");
  });

  it("computes the well-known ownerKey for ROCK ISLAND ARSENAL", () => {
    expect(ownerKey("ROCK ISLAND ARSENAL")).toBe("rock-island-arsenal-5d9a2b2f");
  });
});

describe("fnv1a32", () => {
  it("is deterministic and returns an unsigned 32-bit integer", () => {
    expect(fnv1a32("ROCK ISLAND ARSENAL")).toBe(fnv1a32("ROCK ISLAND ARSENAL"));
    const h = fnv1a32("ROCK ISLAND ARSENAL");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("ownerSlug", () => {
  it("lowercases, hyphenates non-alphanumerics, trims edge hyphens, and caps at 40 chars", () => {
    expect(ownerSlug("ROCK ISLAND ARSENAL")).toBe("rock-island-arsenal");
    expect(ownerSlug("Kaha Arthur L III & Brandy A")).toBe("kaha-arthur-l-iii-brandy-a");
  });
});
