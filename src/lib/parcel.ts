import type { Feature, Geometry } from "geojson";

/**
 * A field is either present with a value, or absent. There is no third state and no
 * default: the UI must render an explicit "not available" for `{ present: false }`
 * rather than a zero, an empty string, or a dash that reads like real data.
 */
export type FieldState<T> = { present: true; value: T } | { present: false };

/**
 * The Rock Island source encodes "no value" as `""` **and** as `" "` (a single space),
 * not as null. An `IS NOT NULL` check over-counts. Any value that is empty once trimmed
 * is missing.
 *
 * Trimming leading/trailing whitespace is the only permitted transformation. Values are
 * never upper/lower-cased, re-spaced, or "corrected" — dirty strings such as
 * `"UNIT 24515 729R"` render verbatim.
 */
export function textField(raw: unknown): FieldState<string> {
  if (raw === null || raw === undefined) return { present: false };
  const s = String(raw);
  if (s.trim() === "") return { present: false };
  return { present: true, value: s.trim() };
}

/**
 * `zeroIsMissing` is opt-in, and it matters. `EAV`/`EMV` of exactly 0 is a REAL assessed
 * value (tax-exempt owners: colleges, the city, school districts, churches) and must
 * render as `$0`. `GIS_acres_num` of 0 is geometrically impossible for a polygon and IS
 * missing.
 */
export function numberField(raw: unknown, opts?: { zeroIsMissing?: boolean }): FieldState<number> {
  if (raw === null || raw === undefined) return { present: false };
  if (typeof raw === "string" && raw.trim() === "") return { present: false };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { present: false };
  if (opts?.zeroIsMissing === true && n === 0) return { present: false };
  return { present: true, value: n };
}

/** The eight source fields, spelled exactly as the county service spells them. */
export type RawParcelProperties = {
  PIN: unknown;
  owner1_name: unknown;
  taxbill_name: unknown;
  EAV: unknown;
  EMV: unknown;
  taxbill_addr: unknown;
  taxbill_csz: unknown;
  GIS_acres_num: unknown;
};

export type Parcel = {
  pin: string; // "UNKNOWN" when the source says so; never synthesised
  owner: FieldState<string>; // from owner1_name
  taxBillName: FieldState<string>; // from taxbill_name
  assessedValue: FieldState<number>; // from EAV
  marketValue: FieldState<number>; // from EMV
  mailingStreet: FieldState<string>; // from taxbill_addr
  mailingCityStateZip: FieldState<string>; // from taxbill_csz — ONE combined string
  acres: FieldState<number>; // from GIS_acres_num
  geometry: Geometry;
};

export const UNAVAILABLE_LABEL = "Not available";
export const TAX_EXEMPT_NOTE = "Source reports EAV 0 — commonly a tax-exempt parcel.";

export function toParcel(feature: Feature<Geometry, RawParcelProperties>): Parcel {
  const p = feature.properties;
  const pin = textField(p.PIN);
  return {
    pin: pin.present ? pin.value : "UNKNOWN",
    owner: textField(p.owner1_name),
    taxBillName: textField(p.taxbill_name),
    // zeroIsMissing deliberately NOT set: EAV/EMV of 0 is a real, honest value.
    assessedValue: numberField(p.EAV),
    marketValue: numberField(p.EMV),
    mailingStreet: textField(p.taxbill_addr),
    mailingCityStateZip: textField(p.taxbill_csz),
    acres: numberField(p.GIS_acres_num, { zeroIsMissing: true }),
    geometry: feature.geometry,
  };
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** "$1,234,567" — en-US, no decimals. */
export function formatMoney(v: number): string {
  return MONEY.format(v);
}

/** "3.43 ac" — two decimals. */
export function formatAcres(v: number): string {
  return v.toFixed(2) + " ac";
}
