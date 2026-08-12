/**
 * A minimal RFC 4180-ish CSV writer, tuned to the dialect this app's exports need.
 *
 * | Property | Decision |
 * |---|---|
 * | Delimiter | `,` |
 * | Record separator | `\r\n`, including after the final record |
 * | Quoting | A field is wrapped in `"` iff it contains `"`, `,`, `\r`, `\n`, or begins or ends with a space. `"` inside a quoted field is doubled to `""`. Nothing else is ever quoted. |
 * | Numbers | `String(value)` — the source value verbatim. No rounding, no thousands separators, no currency symbol. |
 * | Missing value | A zero-length, unquoted field. Never `0`, `N/A`, `-`, `null`, `NULL`, or `""` as literal text. |
 * | Encoding | UTF-8 with a leading BOM, prepended once to the whole file by the caller (not by `toCsv`). |
 * | MIME | `text/csv;charset=utf-8` |
 * | Header | Exactly one header row, always present even when there are zero data rows. |
 * | Multi-value cell | Joined with `;` and no space (e.g. `parcel_pins`, `project_names_crm`). |
 *
 * The BOM exists because `PEÑA-REYES GUADALUPE` (PIN `1706313001`) is real data in this
 * county extract — without it, Excel renders `PEÃ‘A`.
 */

export const CSV_BOM = "﻿";
export const CSV_MIME = "text/csv;charset=utf-8";

/**
 * Normalises a cell value to a raw string. `null`/`undefined` become the empty string —
 * the one and only "missing value" representation this writer produces. A `number` is
 * stringified verbatim (no rounding). This function does NOT quote; `toCsv` does that.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return value;
}

/** Wraps a field in `"` iff it needs it, doubling any interior `"`. */
function escapeField(field: string): string {
  if (/[",\r\n]/.test(field) || field !== field.trim()) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Turns a header and a matrix of already-stringified cells into a CSV document. Every
 * cell reaching this function is already a `string` — `toCsv` never stringifies, rounds,
 * or substitutes a default. The BOM is intentionally NOT prepended here; the caller adds
 * it once when constructing the downloadable `Blob`.
 */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((row) => row.map(escapeField).join(",")).join("\r\n") + "\r\n";
}
