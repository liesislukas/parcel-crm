import { describe, expect, it } from "vitest";
import type { FieldState, Parcel } from "@/lib/parcel";
import {
  buildOwnerRecords,
  CONTACT_BOTH_MAX,
  CONTACT_PHONE_ONLY_MAX,
  contactBucket,
  coverageFor,
  fnv1a32,
  mockEmailFor,
  mockPhoneFor,
  ownersWithoutName,
} from "@/lib/owners";

function present<T>(value: T): FieldState<T> {
  return { present: true, value };
}

function absent<T>(): FieldState<T> {
  return { present: false };
}

function makeParcel(overrides: Partial<Parcel> & { pin: string }): Parcel {
  return {
    pin: overrides.pin,
    owner: overrides.owner ?? present("SOME OWNER"),
    taxBillName: overrides.taxBillName ?? absent(),
    assessedValue: overrides.assessedValue ?? absent(),
    marketValue: overrides.marketValue ?? absent(),
    mailingStreet: overrides.mailingStreet ?? absent(),
    mailingCityStateZip: overrides.mailingCityStateZip ?? absent(),
    acres: overrides.acres ?? absent(),
    geometry: overrides.geometry ?? { type: "Point", coordinates: [0, 0] },
  };
}

describe("fnv1a32", () => {
  it("matches the verified hash values from the plan", () => {
    expect(fnv1a32("AUGUSTANA COLLEGE")).toBe(3653282859);
    expect(fnv1a32("CITY OF ROCK ISLAND")).toBe(2857429873);
    expect(fnv1a32("FIRST FINANCIAL GROUP LLC")).toBe(4143872276);
  });
});

describe("contactBucket / coverageFor", () => {
  it("maps the bucket boundaries to the right coverage state", () => {
    expect(CONTACT_BOTH_MAX).toBe(59);
    expect(CONTACT_PHONE_ONLY_MAX).toBe(74);

    // AUGUSTANA COLLEGE -> bucket 59 -> "both"
    expect(contactBucket("AUGUSTANA COLLEGE")).toBe(59);
    expect(coverageFor("AUGUSTANA COLLEGE")).toBe("both");

    // CITY OF ROCK ISLAND -> bucket 73 -> "phone-only"
    expect(contactBucket("CITY OF ROCK ISLAND")).toBe(73);
    expect(coverageFor("CITY OF ROCK ISLAND")).toBe("phone-only");

    // FIRST FINANCIAL GROUP LLC -> bucket 76 -> "none"
    expect(contactBucket("FIRST FINANCIAL GROUP LLC")).toBe(76);
    expect(coverageFor("FIRST FINANCIAL GROUP LLC")).toBe("none");
  });
});

describe("mockEmailFor / mockPhoneFor", () => {
  it("produces the verified mock contact values", () => {
    expect(mockEmailFor("AUGUSTANA COLLEGE")).toBe("augustana.college@mock.invalid");
    expect(mockPhoneFor("AUGUSTANA COLLEGE")).toBe("(309) 555-0105");
    expect(mockPhoneFor("CITY OF ROCK ISLAND")).toBe("(309) 555-0147");
  });
});

describe("buildOwnerRecords", () => {
  it("skips parcels with an absent owner, and reports them via ownersWithoutName", () => {
    const parcels = [
      makeParcel({ pin: "0000000001", owner: absent() }),
      makeParcel({ pin: "0000000002", owner: present("SOLO OWNER") }),
    ];
    const records = buildOwnerRecords(parcels);
    expect(records).toHaveLength(1);
    expect(records[0].ownerKey).toBe("SOLO OWNER");
    expect(ownersWithoutName(parcels)).toEqual(["0000000001"]);
  });

  it("collapses two parcels with the same owner string into one record", () => {
    const parcels = [
      makeParcel({ pin: "0000000002", owner: present("DUPLICATE OWNER") }),
      makeParcel({ pin: "0000000001", owner: present("DUPLICATE OWNER") }),
    ];
    const records = buildOwnerRecords(parcels);
    expect(records).toHaveLength(1);
    expect(records[0].parcelCount).toBe(2);
    // parcels sorted by pin ascending
    expect(records[0].parcels.map((p) => p.pin)).toEqual(["0000000001", "0000000002"]);
  });

  it("sorts by parcelCount descending, then ownerKey ascending", () => {
    const parcels = [
      makeParcel({ pin: "0000000001", owner: present("ONE PARCEL OWNER B") }),
      makeParcel({ pin: "0000000002", owner: present("ONE PARCEL OWNER A") }),
      makeParcel({ pin: "0000000003", owner: present("TWO PARCEL OWNER") }),
      makeParcel({ pin: "0000000004", owner: present("TWO PARCEL OWNER") }),
    ];
    const records = buildOwnerRecords(parcels);
    expect(records.map((r) => r.ownerKey)).toEqual([
      "TWO PARCEL OWNER",
      "ONE PARCEL OWNER A",
      "ONE PARCEL OWNER B",
    ]);
  });

  it("sums totalAcres only over parcels with present acreage", () => {
    const parcels = [
      makeParcel({ pin: "0000000001", owner: present("ACREAGE OWNER"), acres: present(1.5) }),
      makeParcel({ pin: "0000000002", owner: present("ACREAGE OWNER"), acres: absent() }),
      makeParcel({ pin: "0000000003", owner: present("ACREAGE OWNER"), acres: present(2.25) }),
    ];
    const records = buildOwnerRecords(parcels);
    expect(records[0].totalAcres).toBeCloseTo(3.75);
  });

  it("builds distinct, sorted mailing addresses from street/cityStateZip combinations", () => {
    const parcels = [
      makeParcel({
        pin: "0000000001",
        owner: present("MULTI ADDRESS OWNER"),
        mailingStreet: present("100 MAIN ST"),
        mailingCityStateZip: present("ROCK ISLAND IL 61201"),
      }),
      makeParcel({
        pin: "0000000002",
        owner: present("MULTI ADDRESS OWNER"),
        mailingStreet: present("100 MAIN ST"),
        mailingCityStateZip: present("ROCK ISLAND IL 61201"),
      }),
      makeParcel({
        pin: "0000000003",
        owner: present("MULTI ADDRESS OWNER"),
        mailingStreet: present("1 PARK AVE"),
        mailingCityStateZip: absent(),
      }),
      makeParcel({
        pin: "0000000004",
        owner: present("MULTI ADDRESS OWNER"),
        mailingStreet: absent(),
        mailingCityStateZip: absent(),
      }),
    ];
    const records = buildOwnerRecords(parcels);
    expect(records[0].mailingAddresses).toEqual([
      "1 PARK AVE",
      "100 MAIN ST — ROCK ISLAND IL 61201",
    ]);
  });

  it("round-trips ownerId through decodeURIComponent for a co-owner name containing a slash", () => {
    const parcels = [makeParcel({ pin: "0000000001", owner: present("ZETINA M/GRANJA O") })];
    const records = buildOwnerRecords(parcels);
    expect(decodeURIComponent(records[0].ownerId)).toBe("ZETINA M/GRANJA O");
  });
});
