import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toParcelFromRow, type Parcel, type ParcelAttrRow } from "@/lib/parcel";
import type { Owner } from "@/lib/owners";
import {
  SEEDED_AUDIENCE_OWNER_NAMES,
  SEEDED_PROJECT_B_ID,
  SEEDED_PROJECT_ID,
  SEEDED_PROJECT_SEEDS,
  pickSeedAudience,
  seedCampaignNowMs,
  seededProjects,
} from "./seedData";

/**
 * Deviation from the original plan, recorded: the plan targeted
 * `public/data/rock-island-parcels.json` (a GeoJSON `FeatureCollection`), which ISSUE-013
 * deleted. This test reads the columnar sidecar that replaced it, `.attrs.json`, the same
 * way `src/lib/owners.test.ts` and `src/lib/campaigns/templates.test.ts` already do —
 * `readFileSync` with a plain path relative to the repo root (vitest's cwd), reusing
 * `toParcelFromRow` rather than hand-parsing columns.
 */
function loadParcels(): Parcel[] {
  const raw = JSON.parse(readFileSync("public/data/rock-island-parcels.attrs.json", "utf8")) as {
    rows: ParcelAttrRow[];
  };
  return raw.rows.map(toParcelFromRow);
}

function makeOwner(name: string): Owner {
  return {
    ownerKey: name,
    ownerName: name,
    parcelPins: [],
    parcelCount: 0,
    totalAcres: 0,
    mailingStreet: null,
    mailingCityStateZip: null,
  };
}

describe("seedData against the real committed county file", () => {
  const parcels = loadParcels();

  it("every seed PIN resolves to exactly one parcel, matching the baked-in parcelIds literal", () => {
    for (const seed of SEEDED_PROJECT_SEEDS) {
      seed.pins.forEach((pin, i) => {
        const matches = parcels.filter((p) => p.pin === pin);
        expect(matches.length, `PIN ${pin} should resolve to exactly one parcel record`).toBe(1);
        expect(matches[0].id).toBe(seed.parcelIds[i]);
      });
    }
  });

  it("sums to 45.97 ac (project A) and 15.98 ac (project B)", () => {
    const expected = ["45.97", "15.98"];
    SEEDED_PROJECT_SEEDS.forEach((seed, i) => {
      const sum = seed.pins.reduce((total, pin) => {
        const parcel = parcels.find((p) => p.pin === pin)!;
        return total + (parcel.acres.present ? parcel.acres.value : 0);
      }, 0);
      expect(sum.toFixed(2)).toBe(expected[i]);
    });
  });

  it("every audience owner name owns at least one parcel with a non-empty mailing street", () => {
    for (const name of SEEDED_AUDIENCE_OWNER_NAMES) {
      const owned = parcels.filter((p) => p.owner.present && p.owner.value === name);
      expect(owned.length, `${name} should own at least one parcel`).toBeGreaterThan(0);
      expect(
        owned.some((p) => p.mailingStreet.present),
        `${name} should have a mailing street on file (direct-mail reachability)`,
      ).toBe(true);
    }
  });

  it("has exactly 7 audience owner names, no duplicates", () => {
    expect(SEEDED_AUDIENCE_OWNER_NAMES.length).toBe(7);
    expect(new Set(SEEDED_AUDIENCE_OWNER_NAMES).size).toBe(7);
  });

  it("seededProjects('2026-08-12') returns the two seeded v2 projects", () => {
    const projects = seededProjects("2026-08-12");

    expect(projects.map((p) => p.id)).toEqual([SEEDED_PROJECT_ID, SEEDED_PROJECT_B_ID]);
    expect(projects.every((p) => p.seeded === true)).toBe(true);
    expect(projects[0].createdAt).toBe("2026-07-31T09:00:00.000Z");
    expect(projects[1].createdAt).toBe("2026-08-06T09:00:00.000Z");
    expect(projects[0].updatedAt).toBe(projects[0].createdAt);
    expect(projects[1].updatedAt).toBe(projects[1].createdAt);
    expect(projects[0].parcelIds).toEqual(["47384", "47383", "47381"]);
    expect(projects[1].parcelIds).toEqual(["31729", "27605", "31736"]);
  });

  it("pickSeedAudience returns names in SEEDED_AUDIENCE_OWNER_NAMES order and drops an unmatched owner", () => {
    const shuffled: Owner[] = [
      makeOwner("RI METROPOLITAN MASS TRAN"),
      makeOwner("SOME UNRELATED OWNER"),
      makeOwner("COLUMBIA BUSINESS PARK LLC"),
      makeOwner("IA IL GAS & ELECTRIC CO"),
      makeOwner("MCRE 44 LLC"),
      makeOwner("CRESTHILL PRESERV GRP LLC"),
      makeOwner("LRC HV LLC"),
      makeOwner("CITY OF ROCK ISLAND"),
    ];

    const picked = pickSeedAudience(shuffled);
    expect(picked.map((o) => o.ownerName)).toEqual(SEEDED_AUDIENCE_OWNER_NAMES);
  });

  it("seedCampaignNowMs is deterministic, five days before `today` at 09:00 UTC", () => {
    expect(seedCampaignNowMs("2026-08-12")).toBe(Date.parse("2026-08-07T09:00:00.000Z"));
  });
});
