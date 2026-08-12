import type { Parcel } from "@/lib/parcel";

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

/** 32-bit unsigned FNV-1a hash. Reused verbatim by W2, W4 and W6 — defined once, here. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

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
