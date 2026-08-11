import { describe, expect, it } from "vitest";
import type { Feature, Geometry } from "geojson";
import {
  formatAcres,
  formatMoney,
  numberField,
  textField,
  toParcel,
  type RawParcelProperties,
} from "./parcel";

const SQUARE: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

function feature(properties: RawParcelProperties): Feature<Geometry, RawParcelProperties> {
  return { type: "Feature", geometry: SQUARE, properties };
}

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

describe("toParcel", () => {
  it("maps the real ROCK ISLAND ARSENAL record: EAV 0 present, mailing address absent", () => {
    // Verbatim from public/data/rock-island-parcels.json, PIN 0725200001.
    const parcel = toParcel(
      feature({
        PIN: "0725200001",
        owner1_name: "ROCK ISLAND ARSENAL",
        taxbill_name: "ROCK ISLAND ARSENAL",
        EAV: 0,
        EMV: 0,
        taxbill_addr: "",
        taxbill_csz: "",
        GIS_acres_num: 975.6855737299176,
      }),
    );

    expect(parcel.pin).toBe("0725200001");
    expect(parcel.owner).toEqual({ present: true, value: "ROCK ISLAND ARSENAL" });
    expect(parcel.assessedValue.present).toBe(true);
    expect(parcel.assessedValue).toEqual({ present: true, value: 0 });
    expect(parcel.marketValue).toEqual({ present: true, value: 0 });
    expect(parcel.mailingStreet.present).toBe(false);
    expect(parcel.mailingCityStateZip.present).toBe(false);
    expect(parcel.acres).toEqual({ present: true, value: 975.6855737299176 });
    expect(parcel.geometry).toBe(SQUARE);
  });

  it("falls back to the literal string UNKNOWN when every attribute is null", () => {
    const parcel = toParcel(
      feature({
        PIN: null,
        owner1_name: null,
        taxbill_name: null,
        EAV: null,
        EMV: null,
        taxbill_addr: null,
        taxbill_csz: null,
        GIS_acres_num: null,
      }),
    );

    expect(parcel.pin).toBe("UNKNOWN");
    expect(parcel.owner.present).toBe(false);
    expect(parcel.taxBillName.present).toBe(false);
    expect(parcel.assessedValue.present).toBe(false);
    expect(parcel.marketValue.present).toBe(false);
    expect(parcel.mailingStreet.present).toBe(false);
    expect(parcel.mailingCityStateZip.present).toBe(false);
    expect(parcel.acres.present).toBe(false);
  });

  it("passes a literal UNKNOWN PIN through rather than synthesising one", () => {
    const parcel = toParcel(
      feature({
        PIN: "UNKNOWN",
        owner1_name: " ",
        taxbill_name: "SOME LLC",
        EAV: 12345,
        EMV: 40000,
        taxbill_addr: "UNIT 24515 729R",
        taxbill_csz: "CORDOVA IL 612420006",
        GIS_acres_num: 0,
      }),
    );

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
