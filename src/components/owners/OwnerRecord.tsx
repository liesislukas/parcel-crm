"use client";

import type { ReactNode } from "react";
import { formatAcres, formatMoney, UNAVAILABLE_LABEL, type FieldState } from "@/lib/parcel";
import type { OwnerRecord as OwnerRecordType } from "@/lib/owners";
import { effectiveContact, type EffectiveContact, type EnrichmentStore } from "@/lib/store";
import EnrichContactFlow from "@/components/owners/EnrichContactFlow";

const PANEL_CLASS = "rounded-lg border border-black/10 p-4 text-sm dark:border-white/15";
const MISSING_CLASS = "text-black/45 italic dark:text-white/45";
const NOTE_CLASS = "mt-2 text-xs text-black/45 dark:text-white/45";
const MOCKED_BADGE_CLASS =
  "rounded-sm border border-current px-1.5 py-0.5 text-[9px] tracking-wide uppercase";
const PARCEL_ROW_CAP = 25;

const COUNTY_SOURCE_CAPTION =
  "Source: Rock Island County GIS parcel layer (owner1_name, taxbill_name, taxbill_addr, " +
  "taxbill_csz), retrieved 2026-08-11.";

const METHODOLOGY_NOTE =
  "Email and phone on this screen are generated, not real. They are derived deterministically " +
  "from the owner name, so the same owner always shows the same values. Emails use the reserved " +
  ".invalid domain and phone numbers use the NANP 555-0100–555-0199 block reserved for fictional " +
  "use, so neither can be contacted. Because that block holds only 100 numbers and there are " +
  "4,573 owners, phone numbers repeat across owners. No contact data was purchased, scraped, or " +
  "obtained from Rock Island County.";

/**
 * The three visually distinct field renderings this issue exists to enforce
 * (`.agents/rules/provenance-honesty.mdc`): a real county value, a county value not
 * available from this source, and a simulated value (present or not-on-file). Every field
 * on this record goes through here — nothing quietly falls back to an undifferentiated
 * "missing".
 */
function CountyValue({ children }: { children: ReactNode }) {
  return (
    <span data-source="county" data-field-state="present">
      {children}
    </span>
  );
}

function CountyMissing() {
  return (
    <span data-source="county" data-field-state="missing" className={MISSING_CLASS}>
      {UNAVAILABLE_LABEL}
    </span>
  );
}

function MockValue({ children }: { children: ReactNode }) {
  return (
    <span data-source="mock" data-field-state="present">
      {children}{" "}
      <span
        data-testid="mocked-badge"
        title="Simulated contact data — not from Rock Island County"
        className={MOCKED_BADGE_CLASS}
      >
        MOCKED
      </span>
    </span>
  );
}

function MockMissing() {
  return (
    <span data-source="mock" data-field-state="not-collected" className={MISSING_CLASS}>
      Not on file
    </span>
  );
}

function mailingAddressLine(street: FieldState<string>, cityStateZip: FieldState<string>): string {
  if (street.present && cityStateZip.present) return `${street.value} — ${cityStateZip.value}`;
  if (street.present) return street.value;
  if (cityStateZip.present) return cityStateZip.value;
  return UNAVAILABLE_LABEL;
}

function detailLine(contact: EffectiveContact): string {
  if (contact.email !== null && contact.phone !== null)
    return "Email and phone on file (simulated).";
  if (contact.phone !== null)
    return "Phone on file (simulated). No email on file — never purchased.";
  return "No contact information on file — never purchased.";
}

type OwnerRecordProps = {
  owner: OwnerRecordType;
  store: EnrichmentStore;
  onEnriched: (s: EnrichmentStore) => void;
};

export default function OwnerRecord({ owner, store, onEnriched }: OwnerRecordProps) {
  const contact = effectiveContact(owner, store);

  const taxBillNames = [
    ...new Set(
      owner.parcels
        .map((p) => p.taxBillName)
        .filter((f): f is { present: true; value: string } => f.present)
        .map((f) => f.value),
    ),
  ];

  const parcelsWithUnknownAcreage = owner.parcels.filter((p) => !p.acres.present).length;
  const visibleParcels = owner.parcels.slice(0, PARCEL_ROW_CAP);

  return (
    <div data-testid="owner-record" className={`${PANEL_CLASS} flex flex-col gap-4`}>
      {/* 1. Header */}
      <header>
        <h2 className="text-lg font-semibold">{owner.ownerKey}</h2>
        <p className="text-black/60 dark:text-white/60">
          {owner.parcelCount} parcel{owner.parcelCount === 1 ? "" : "s"} ·{" "}
          {formatAcres(owner.totalAcres)} total
          {parcelsWithUnknownAcreage > 0
            ? ` · acreage unknown for ${parcelsWithUnknownAcreage} parcel(s)`
            : ""}
        </p>
      </header>

      {/* 2. County-sourced fields */}
      <section>
        <h3 className="text-xs font-semibold tracking-wide text-black/55 uppercase dark:text-white/55">
          Ownership — county source
        </h3>
        <dl className="mt-2 flex flex-col gap-2">
          <div>
            <dt className="text-xs text-black/55 dark:text-white/55">Owner name</dt>
            <dd>
              <CountyValue>{owner.ownerKey}</CountyValue>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-black/55 dark:text-white/55">Tax bill name(s)</dt>
            <dd>
              {taxBillNames.length > 0 ? (
                <CountyValue>{taxBillNames.join(", ")}</CountyValue>
              ) : (
                <CountyMissing />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-black/55 dark:text-white/55">Mailing address(es)</dt>
            <dd>
              {owner.mailingAddresses.length > 0 ? (
                <span className="flex flex-col gap-0.5">
                  {owner.mailingAddresses.map((addr) => (
                    <CountyValue key={addr}>{addr}</CountyValue>
                  ))}
                </span>
              ) : (
                <CountyMissing />
              )}
            </dd>
          </div>
        </dl>
        <p className={NOTE_CLASS}>{COUNTY_SOURCE_CAPTION}</p>
      </section>

      {/* 3. Contact information — simulated */}
      <section data-testid="owner-contact">
        <h3 className="text-xs font-semibold tracking-wide text-black/55 uppercase dark:text-white/55">
          Contact information — simulated
        </h3>
        <dl className="mt-2 flex flex-col gap-2">
          <div>
            <dt className="text-xs text-black/55 dark:text-white/55">Email</dt>
            <dd data-testid="owner-email">
              {contact.email !== null ? <MockValue>{contact.email}</MockValue> : <MockMissing />}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-black/55 dark:text-white/55">Phone</dt>
            <dd data-testid="owner-phone">
              {contact.phone !== null ? <MockValue>{contact.phone}</MockValue> : <MockMissing />}
            </dd>
          </div>
        </dl>
        <p className={NOTE_CLASS}>{METHODOLOGY_NOTE}</p>
      </section>

      {/* 4. Completeness */}
      <section data-testid="owner-completeness" data-completeness={contact.completeness}>
        <p className="text-base font-semibold">
          {contact.completeness === "complete" ? "Complete" : "Incomplete"}
        </p>
        <p className="text-black/60 dark:text-white/60">{detailLine(contact)}</p>
        {contact.enrichedBy ? (
          <p className="text-black/60 dark:text-white/60">
            Completed by a simulated purchase on {contact.enrichedBy.enrichedAt.slice(0, 10)}.
          </p>
        ) : null}
      </section>

      {/* 5. Enrichment slot */}
      <EnrichContactFlow owner={owner} contact={contact} onEnriched={onEnriched} />

      {/* 6. Parcels */}
      <section>
        <h3 className="text-xs font-semibold tracking-wide text-black/55 uppercase dark:text-white/55">
          Parcels ({owner.parcelCount})
        </h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-black/55 dark:text-white/55">
                <th className="pr-3 pb-1 font-medium">PIN</th>
                <th className="pr-3 pb-1 font-medium">Tax bill name</th>
                <th className="pr-3 pb-1 font-medium">Mailing address</th>
                <th className="pr-3 pb-1 font-medium">Acreage</th>
                <th className="pb-1 font-medium">Assessed value</th>
              </tr>
            </thead>
            <tbody>
              {visibleParcels.map((p) => (
                <tr
                  key={p.pin}
                  data-testid="owner-parcel-row"
                  className="border-t border-black/5 dark:border-white/10"
                >
                  <td className="py-1 pr-3 font-mono">{p.pin}</td>
                  <td className="py-1 pr-3">
                    {p.taxBillName.present ? p.taxBillName.value : UNAVAILABLE_LABEL}
                  </td>
                  <td className="py-1 pr-3">
                    {mailingAddressLine(p.mailingStreet, p.mailingCityStateZip)}
                  </td>
                  <td className="py-1 pr-3">
                    {p.acres.present ? formatAcres(p.acres.value) : UNAVAILABLE_LABEL}
                  </td>
                  <td className="py-1">
                    {p.assessedValue.present
                      ? formatMoney(p.assessedValue.value)
                      : UNAVAILABLE_LABEL}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {owner.parcelCount > PARCEL_ROW_CAP ? (
          <p className={NOTE_CLASS}>
            Showing {PARCEL_ROW_CAP} of {owner.parcelCount} parcels for this owner.
          </p>
        ) : null}
      </section>
    </div>
  );
}
