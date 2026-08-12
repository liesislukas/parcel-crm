import type { FieldState, Parcel } from "@/lib/parcel";

/**
 * Owner CRM records, derived purely from the already-typed `Parcel[]` (see `@/lib/parcel`).
 * No React, no `localStorage`, no `fetch` here — this module stays pure and node-testable.
 *
 * Coordinator note (2026-08-12): this file is SHARED with ISSUE-006, which appends its own,
 * disjoint export set (`deriveOwners`, `ownerKey`, `ownerSlug`, `fnv1a32`, `type Owner`,
 * `MAILING_SOURCE_LABEL`, `NO_MAILING_ADDRESS_REASON`) below this issue's exports. `fnv1a32`
 * is ONE implementation (32-bit FNV-1a via `Math.imul` + `>>> 0`) shared by both issues. Owner
 * identity is the same in both: `textField(owner1_name)`, trim only, verbatim otherwise.
 */

export type ContactField = "email" | "phone";
export type ContactCoverage = "both" | "phone-only" | "none";
export type Completeness = "complete" | "incomplete";

export type OwnerParcelRef = {
  pin: string;
  taxBillName: FieldState<string>;
  mailingStreet: FieldState<string>;
  mailingCityStateZip: FieldState<string>;
  acres: FieldState<number>;
  assessedValue: FieldState<number>;
};

export type OwnerRecord = {
  ownerKey: string; // trimmed owner1_name, verbatim — the identity
  ownerId: string; // encodeURIComponent(ownerKey) — the URL value
  parcels: OwnerParcelRef[]; // sorted by pin ascending
  parcelCount: number;
  totalAcres: number; // sum of parcels whose acres.present === true
  mailingAddresses: string[]; // distinct, "street — cityStateZip", sorted ascending
  coverage: ContactCoverage; // from the hash — the BASE state, before any enrichment
  mockEmail: string; // always computed; shown only when the state allows it
  mockPhone: string; // always computed; shown only when the state allows it
};

/** bucket <= 59 -> "both" */
export const CONTACT_BOTH_MAX = 59;
/** bucket <= 74 -> "phone-only", else "none" */
export const CONTACT_PHONE_ONLY_MAX = 74;

/**
 * FNV-1a, 32-bit. Deterministic, no `Math.random`. `Math.imul` is required — a plain `*`
 * overflows JS's float-backed numbers and silently produces different values.
 */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function contactBucket(ownerKey: string): number {
  return fnv1a32(ownerKey) % 100;
}

export function coverageFor(ownerKey: string): ContactCoverage {
  const bucket = contactBucket(ownerKey);
  if (bucket <= CONTACT_BOTH_MAX) return "both";
  if (bucket <= CONTACT_PHONE_ONLY_MAX) return "phone-only";
  return "none";
}

/**
 * lowercase, every run of non-alphanumeric characters replaced by ".", leading/trailing
 * dots stripped, truncated to 40 characters, then trailing dots stripped again.
 */
function slug(input: string): string {
  const collapsed = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const truncated = collapsed.slice(0, 40);
  return truncated.replace(/\.+$/g, "");
}

export function mockEmailFor(ownerKey: string): string {
  return `${slug(ownerKey)}@mock.invalid`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "(309) 555-0100" through "(309) 555-0199" — the NANP block reserved for fictional use. */
export function mockPhoneFor(ownerKey: string): string {
  const n = fnv1a32(`phone:${ownerKey}`) % 100;
  return `(309) 555-01${pad2(n)}`;
}

function mailingAddressFor(
  street: FieldState<string>,
  cityStateZip: FieldState<string>,
): string | null {
  if (street.present && cityStateZip.present) return `${street.value} — ${cityStateZip.value}`;
  if (street.present) return street.value;
  if (cityStateZip.present) return cityStateZip.value;
  return null;
}

/**
 * Groups parcels by `owner.value` (verbatim, trim-only — see `@/lib/parcel`), skipping any
 * parcel whose `owner.present === false`. The result is sorted by `parcelCount` descending,
 * then `ownerKey` ascending — a total order, so the list is stable across reloads.
 */
export function buildOwnerRecords(parcels: Parcel[]): OwnerRecord[] {
  const groups = new Map<string, Parcel[]>();
  for (const parcel of parcels) {
    if (!parcel.owner.present) continue;
    const key = parcel.owner.value;
    const existing = groups.get(key);
    if (existing) {
      existing.push(parcel);
    } else {
      groups.set(key, [parcel]);
    }
  }

  const records: OwnerRecord[] = [];
  for (const [ownerKey, ownerParcels] of groups) {
    const sortedParcels = [...ownerParcels].sort((a, b) => a.pin.localeCompare(b.pin));

    const parcelRefs: OwnerParcelRef[] = sortedParcels.map((p) => ({
      pin: p.pin,
      taxBillName: p.taxBillName,
      mailingStreet: p.mailingStreet,
      mailingCityStateZip: p.mailingCityStateZip,
      acres: p.acres,
      assessedValue: p.assessedValue,
    }));

    let totalAcres = 0;
    for (const p of sortedParcels) {
      if (p.acres.present) totalAcres += p.acres.value;
    }

    const mailingAddressSet = new Set<string>();
    for (const p of sortedParcels) {
      const addr = mailingAddressFor(p.mailingStreet, p.mailingCityStateZip);
      if (addr !== null) mailingAddressSet.add(addr);
    }

    records.push({
      ownerKey,
      ownerId: encodeURIComponent(ownerKey),
      parcels: parcelRefs,
      parcelCount: sortedParcels.length,
      totalAcres,
      mailingAddresses: [...mailingAddressSet].sort((a, b) => a.localeCompare(b)),
      coverage: coverageFor(ownerKey),
      mockEmail: mockEmailFor(ownerKey),
      mockPhone: mockPhoneFor(ownerKey),
    });
  }

  records.sort((a, b) => b.parcelCount - a.parcelCount || a.ownerKey.localeCompare(b.ownerKey));
  return records;
}

/** PINs of parcels whose `owner1_name` is absent — sorted ascending. They get no owner record. */
export function ownersWithoutName(parcels: Parcel[]): string[] {
  return parcels
    .filter((p) => !p.owner.present)
    .map((p) => p.pin)
    .sort((a, b) => a.localeCompare(b));
}

// ---- ISSUE-006: campaign-facing owner directory (shared module, disjoint exports) ----

/**
 * A distinct owner derived from the county-sourced parcel data. Every field here traces
 * back to `owner1_name`, `taxbill_addr`, `taxbill_csz`, `PIN` or `GIS_acres_num` in the
 * committed parcel file. This module never contains a mocked value — mocked contact
 * details live in `src/lib/campaigns/contact.ts`. The file split is the provenance
 * boundary per `.agents/rules/provenance-honesty.mdc`.
 */
export type Owner = {
  ownerKey: string; // URL-safe, unique, stable
  ownerName: string; // verbatim owner1_name, trimmed only
  parcelPins: string[]; // ascending, deduplicated
  parcelCount: number;
  totalAcres: number; // sum of Parcel.acres where present
  mailingStreet: string | null; // taxbill_addr of the FIRST parcel that has one
  mailingCityStateZip: string | null; // taxbill_csz of that SAME parcel
};

export function ownerSlug(ownerName: string): string {
  return ownerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function ownerKey(ownerName: string): string {
  return `${ownerSlug(ownerName)}-${fnv1a32(ownerName).toString(16).padStart(8, "0")}`;
}

export function deriveOwners(parcels: Parcel[]): Owner[] {
  const groups = new Map<string, Parcel[]>();

  for (const parcel of parcels) {
    if (!parcel.owner.present) continue;
    const name = parcel.owner.value;
    const group = groups.get(name);
    if (group) {
      group.push(parcel);
    } else {
      groups.set(name, [parcel]);
    }
  }

  const owners: Owner[] = [];

  for (const [ownerName, group] of groups) {
    const parcelPins = Array.from(new Set(group.map((p) => p.pin))).sort();

    let totalAcres = 0;
    for (const parcel of group) {
      if (parcel.acres.present) totalAcres += parcel.acres.value;
    }

    let mailingStreet: string | null = null;
    let mailingCityStateZip: string | null = null;
    for (const parcel of group) {
      if (parcel.mailingStreet.present) {
        mailingStreet = parcel.mailingStreet.value;
        mailingCityStateZip = parcel.mailingCityStateZip.present
          ? parcel.mailingCityStateZip.value
          : null;
        break;
      }
    }

    owners.push({
      ownerKey: ownerKey(ownerName),
      ownerName,
      parcelPins,
      parcelCount: parcelPins.length,
      totalAcres,
      mailingStreet,
      mailingCityStateZip,
    });
  }

  owners.sort((a, b) => {
    if (b.totalAcres !== a.totalAcres) return b.totalAcres - a.totalAcres;
    return a.ownerName.localeCompare(b.ownerName);
  });

  return owners;
}

export const MAILING_SOURCE_LABEL = "Rock Island County GIS — tax-bill address";
export const NO_MAILING_ADDRESS_REASON =
  "No county mailing address on file — this owner cannot receive direct mail.";
