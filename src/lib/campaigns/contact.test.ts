import { describe, expect, it } from "vitest";
import type { Owner } from "@/lib/owners";
import * as contactModule from "./contact";
import { destinationFor, mockedEmail, mockedPhone } from "./contact";

const arsenal: Owner = {
  ownerKey: "rock-island-arsenal-5d9a2b2f",
  ownerName: "ROCK ISLAND ARSENAL",
  parcelPins: ["0725200001"],
  parcelCount: 1,
  totalAcres: 975.6855737299176,
  mailingStreet: null,
  mailingCityStateZip: null,
};

const cityOfRockIsland: Owner = {
  ownerKey: "city-of-rock-island-aa50eb71",
  ownerName: "CITY OF ROCK ISLAND",
  parcelPins: ["0001", "0002"],
  parcelCount: 65,
  totalAcres: 181.58,
  mailingStreet: "1528 3RD AVE",
  mailingCityStateZip: "ROCK ISLAND IL 612018612",
};

function syntheticOwner(i: number): Owner {
  return {
    ownerKey: `synthetic-owner-${i}`,
    ownerName: `SYNTHETIC OWNER ${i}`,
    parcelPins: [`P${i}`],
    parcelCount: 1,
    totalAcres: i,
    mailingStreet: null,
    mailingCityStateZip: null,
  };
}

describe("mockedEmail", () => {
  it("is the ownerKey at the reserved simulated.invalid domain", () => {
    expect(mockedEmail(arsenal)).toBe("rock-island-arsenal-5d9a2b2f@simulated.invalid");
  });

  it("always ends with @simulated.invalid and never contains a space", () => {
    for (let i = 0; i < 100; i++) {
      const email = mockedEmail(syntheticOwner(i));
      expect(email.endsWith("@simulated.invalid")).toBe(true);
      expect(email).not.toContain(" ");
    }
  });
});

describe("mockedPhone", () => {
  it("matches the reserved 555-01xx block for 100 synthetic owner keys", () => {
    for (let i = 0; i < 100; i++) {
      expect(mockedPhone(syntheticOwner(i))).toMatch(/^\+1 \(309\) 555-01\d{2}$/);
    }
  });
});

describe("destinationFor", () => {
  it("is always mailable for email, and mocked provenance", () => {
    const dest = destinationFor(arsenal, "email");
    expect(dest.mailable).toBe(true);
    expect(dest.provenance).toBe("mocked");
  });

  it("reports ROCK ISLAND ARSENAL as unreachable by direct mail, with the exact reason", () => {
    const dest = destinationFor(arsenal, "direct_mail");
    expect(dest.mailable).toBe(false);
    expect(dest.value).toBeNull();
    expect(dest.provenance).toBe("county-source");
    if (!dest.mailable) {
      expect(dest.reason).toBe(
        "No county mailing address on file — this owner cannot receive direct mail.",
      );
    }
  });

  it("renders the real county tax-bill address for direct mail when present", () => {
    const dest = destinationFor(cityOfRockIsland, "direct_mail");
    expect(dest.value).toBe("1528 3RD AVE\nROCK ISLAND IL 612018612");
    expect(dest.provenance).toBe("county-source");
  });
});

describe("no unroutable-looking value ever appears in the module", () => {
  it("contains no example.com, gmail, @rockisland or 555-1212 in any exported string", () => {
    const forbidden = /example\.com|gmail|@rockisland|555-1212/;
    for (const [name, value] of Object.entries(contactModule)) {
      if (typeof value === "string") {
        expect(value, `export ${name}`).not.toMatch(forbidden);
      }
    }
  });
});
