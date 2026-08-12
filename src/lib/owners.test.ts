import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toParcelFromRow, type Parcel, type ParcelAttrRow } from "@/lib/parcel";
import { deriveOwners, fnv1a32, ownerKey, ownerSlug } from "./owners";

function loadParcels(): Parcel[] {
  const raw = JSON.parse(readFileSync("public/data/rock-island-parcels.attrs.json", "utf8")) as {
    rows: ParcelAttrRow[];
  };
  return raw.rows.map(toParcelFromRow);
}

describe("deriveOwners against the real committed parcel file", () => {
  const parcels = loadParcels();

  it("has 65,955 records, 192 with a blank owner1_name", () => {
    expect(parcels.length).toBe(65955);
    const skipped = parcels.filter((p) => !p.owner.present);
    expect(skipped.length).toBe(192);
  });

  it("returns exactly 50,040 distinct owners", () => {
    const owners = deriveOwners(parcels);
    expect(owners.length).toBe(50040);
  });

  it("has zero ownerKey collisions, while ownerSlug alone collides (proving the hash suffix is required)", () => {
    const owners = deriveOwners(parcels);
    const keys = new Set(owners.map((o) => o.ownerKey));
    const slugs = new Set(owners.map((o) => ownerSlug(o.ownerName)));
    expect(keys.size).toBe(50040);
    expect(slugs.size).toBe(49877);
  });

  it("orders by totalAcres descending, then ownerName ascending", () => {
    const owners = deriveOwners(parcels);

    expect(owners[0].ownerName).toBe("MOLINE CONSUMERS CO");
    expect(owners[0].parcelCount).toBe(101);
    expect(owners[0].mailingStreet).toBe("4640 E 56TH ST");
    expect(owners[0].totalAcres).toBeCloseTo(4055.7283599818534, 6);

    expect(owners[1].ownerName).toBe("METRO AIR AUTH");
    expect(owners[1].parcelCount).toBe(219);

    expect(owners[2].ownerName).toBe("DEERE & CO");
    expect(owners[2].parcelCount).toBe(86);
  });

  it("has exactly two owners with no county mailing address", () => {
    const owners = deriveOwners(parcels);
    const noAddress = owners.filter((o) => o.mailingStreet === null);
    expect(noAddress.length).toBe(2);
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
