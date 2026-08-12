import type { LngLat } from "@/lib/geo";

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

/**
 * One row of `public/data/rock-island-parcels.attrs.json`, in the file's column order:
 * `["id","PIN","owner1_name","taxbill_name","EAV","EMV","taxbill_addr","taxbill_csz",
 * "GIS_acres_num","lng","lat","fp"]`. Source values stay `unknown` because the file is a
 * verbatim copy of what the county published.
 */
export type ParcelAttrRow = readonly [
  number, // 0  id — OBJECTID
  unknown, // 1  PIN
  unknown, // 2  owner1_name
  unknown, // 3  taxbill_name
  unknown, // 4  EAV
  unknown, // 5  EMV
  unknown, // 6  taxbill_addr
  unknown, // 7  taxbill_csz
  unknown, // 8  GIS_acres_num
  number | null, // 9  lng — null when the record has no mappable geometry
  number | null, // 10 lat
  string | null, // 11 fp — FNV-1a32 hex of the coordinate array
];

/**
 * `PIN` is NOT unique across Rock Island County: the 65,955 records carry only 65,813 distinct
 * PIN values, and 29 values repeat — `"USA"` alone appears 87 times, `"CITY"` 10, `"RAILROAD"` 9,
 * plus 23 ordinary-looking numeric PINs filed twice. Keying selection, lookup or project
 * membership on PIN would collapse 142 real records and highlight all 87 "USA" parcels on one
 * click. Identity is therefore `id` = `String(OBJECTID)`, which is distinct on all 65,955 records;
 * `pin` is a display and export field only. Do not re-key this on PIN.
 */
export type Parcel = {
  id: string; // String(OBJECTID) — unique, the identity
  pin: string; // verbatim PIN; "UNKNOWN" where the source says so, never synthesised
  owner: FieldState<string>; // from owner1_name
  taxBillName: FieldState<string>; // from taxbill_name
  assessedValue: FieldState<number>; // from EAV
  marketValue: FieldState<number>; // from EMV
  mailingStreet: FieldState<string>; // from taxbill_addr
  mailingCityStateZip: FieldState<string>; // from taxbill_csz — ONE combined string
  acres: FieldState<number>; // from GIS_acres_num
  centroid: LngLat | null; // null for the 2 records that publish an empty polygon ring
  footprint: string | null; // null for the same 2
};

export const UNAVAILABLE_LABEL = "Not available";
export const TAX_EXEMPT_NOTE = "Source reports EAV 0 — commonly a tax-exempt parcel.";

export function toParcelFromRow(row: ParcelAttrRow): Parcel {
  const pin = textField(row[1]);
  return {
    id: String(row[0]),
    pin: pin.present ? pin.value : "UNKNOWN",
    owner: textField(row[2]),
    taxBillName: textField(row[3]),
    // zeroIsMissing deliberately NOT set: EAV/EMV of 0 is a real, honest value.
    assessedValue: numberField(row[4]),
    marketValue: numberField(row[5]),
    mailingStreet: textField(row[6]),
    mailingCityStateZip: textField(row[7]),
    acres: numberField(row[8], { zeroIsMissing: true }),
    centroid: row[9] === null || row[10] === null ? null : { lng: row[9], lat: row[10] },
    footprint: row[11],
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
