import { describe, expect, it } from "vitest";
import {
  formatAcres,
  formatMoney,
  numberField,
  textField,
  toParcelFromRow,
  type ParcelAttrRow,
} from "./parcel";

describe("textField", () => {
  it("treats null, undefined, empty and whitespace-only as missing", () => {
    // The source uses "" AND " " (a single space) for no value, so an IS NOT NULL
    // check over-counts. This is the whole of the missing-value rule for text.
    for (const raw of [null, undefined, "", " ", "\t \n"]) {
      expect(textField(raw)).toEqual({ present: false });
    }
  });

  it("trims only, and never otherwise alters a dirty value", () => {
    expect(textField(" PO BOX 657TAX-DML4N ")).toEqual({
      present: true,
      value: "PO BOX 657TAX-DML4N",
    });
    expect(textField("UNIT 24515 729R")).toEqual({ present: true, value: "UNIT 24515 729R" });
  });
});

describe("numberField", () => {
  it("keeps zero by default, because EAV 0 is a real assessed value", () => {
    expect(numberField(0)).toEqual({ present: true, value: 0 });
  });

  it("drops zero only when asked, for GIS_acres_num", () => {
    expect(numberField(0, { zeroIsMissing: true })).toEqual({ present: false });
  });

  it("treats null, empty strings and non-finite numbers as missing", () => {
    expect(numberField(NaN)).toEqual({ present: false });
    expect(numberField("")).toEqual({ present: false });
    expect(numberField(" ")).toEqual({ present: false });
    expect(numberField(null)).toEqual({ present: false });
    expect(numberField(undefined)).toEqual({ present: false });
    expect(numberField(Infinity)).toEqual({ present: false });
    expect(numberField("not a number")).toEqual({ present: false });
  });

  it("keeps ordinary values, including negatives and numeric strings", () => {
    expect(numberField(975.6855737299176)).toEqual({ present: true, value: 975.6855737299176 });
    expect(numberField("1234")).toEqual({ present: true, value: 1234 });
  });
});

describe("toParcelFromRow", () => {
  it("maps the real ROCK ISLAND ARSENAL record: EAV 0 present, mailing address absent", () => {
    // Verbatim from public/data/rock-island-parcels.attrs.json, PIN 0725200001.
    const row: ParcelAttrRow = [
      12345,
      "0725200001",
      "ROCK ISLAND ARSENAL",
      "ROCK ISLAND ARSENAL",
      0,
      0,
      "",
      "",
      975.6855737299176,
      -90.55,
      41.51,
      "1f2e3d4c",
    ];
    const parcel = toParcelFromRow(row);

    expect(parcel.id).toBe("12345");
    expect(parcel.pin).toBe("0725200001");
    expect(parcel.owner).toEqual({ present: true, value: "ROCK ISLAND ARSENAL" });
    expect(parcel.assessedValue.present).toBe(true);
    expect(parcel.assessedValue).toEqual({ present: true, value: 0 });
    expect(parcel.marketValue).toEqual({ present: true, value: 0 });
    expect(parcel.mailingStreet.present).toBe(false);
    expect(parcel.mailingCityStateZip.present).toBe(false);
    expect(parcel.acres).toEqual({ present: true, value: 975.6855737299176 });
    expect(parcel.centroid).toEqual({ lng: -90.55, lat: 41.51 });
    expect(parcel.footprint).toBe("1f2e3d4c");
  });

  it("falls back to the literal string UNKNOWN when every attribute is null", () => {
    const parcel = toParcelFromRow([1, null, null, null, null, null, null, null, null, 0, 0, "0"]);

    expect(parcel.pin).toBe("UNKNOWN");
    expect(parcel.owner.present).toBe(false);
    expect(parcel.taxBillName.present).toBe(false);
    expect(parcel.assessedValue.present).toBe(false);
    expect(parcel.marketValue.present).toBe(false);
    expect(parcel.mailingStreet.present).toBe(false);
    expect(parcel.mailingCityStateZip.present).toBe(false);
    expect(parcel.acres.present).toBe(false);
  });

  it("treats a blank PIN as UNKNOWN rather than an empty parcel identifier", () => {
    const parcel = toParcelFromRow([
      2,
      " ",
      "SOME LLC",
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      "0",
    ]);

    expect(parcel.pin).toBe("UNKNOWN");
    expect(parcel.owner).toEqual({ present: true, value: "SOME LLC" });
  });

  it("passes a literal UNKNOWN PIN through rather than synthesising one", () => {
    const parcel = toParcelFromRow([
      3,
      "UNKNOWN",
      " ",
      "SOME LLC",
      12345,
      40000,
      "UNIT 24515 729R",
      "CORDOVA IL 612420006",
      0,
      -90.3,
      41.7,
      "deadbeef",
    ]);

    expect(parcel.pin).toBe("UNKNOWN");
    expect(parcel.owner.present).toBe(false);
    expect(parcel.taxBillName).toEqual({ present: true, value: "SOME LLC" });
    expect(parcel.assessedValue).toEqual({ present: true, value: 12345 });
    expect(parcel.mailingStreet).toEqual({ present: true, value: "UNIT 24515 729R" });
    // taxbill_csz is ONE combined string and is never split into city / state / zip.
    expect(parcel.mailingCityStateZip).toEqual({
      present: true,
      value: "CORDOVA IL 612420006",
    });
    // A polygon of zero acres is impossible, so 0 acres is missing.
    expect(parcel.acres).toEqual({ present: false });
  });

  it("keeps the two empty-ring records as records, with no centroid and no footprint", () => {
    // PIN 1710408032 publishes {"type":"Polygon","coordinates":[[]]} at source: real owner,
    // real EAV, no outline. It loads into the CRM and is never given an invented geometry.
    const parcel = toParcelFromRow([
      47305,
      "1710408032",
      "PAROLLIE LLC SERIES 4",
      "PAROLLIE LLC SERIES 4",
      68638,
      205935,
      "504 19TH AVE",
      "MOLINE IL 61265",
      0,
      null,
      null,
      null,
    ]);

    expect(parcel.id).toBe("47305");
    expect(parcel.pin).toBe("1710408032");
    expect(parcel.owner).toEqual({ present: true, value: "PAROLLIE LLC SERIES 4" });
    expect(parcel.assessedValue).toEqual({ present: true, value: 68638 });
    expect(parcel.centroid).toBeNull();
    expect(parcel.footprint).toBeNull();
  });
});

describe("formatters", () => {
  it("formats money as whole en-US dollars", () => {
    expect(formatMoney(1234567)).toBe("$1,234,567");
    expect(formatMoney(0)).toBe("$0");
  });

  it("formats acres to two decimals", () => {
    expect(formatAcres(3.4321)).toBe("3.43 ac");
    expect(formatAcres(975.6855737299176)).toBe("975.69 ac");
  });
});
