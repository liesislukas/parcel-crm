import { csvCell } from "./csv";
import type { FieldState, Parcel } from "@/lib/parcel";
import type { ParcelMeta } from "@/lib/parcelData";

/**
 * All three export column lists are declared here, up front, in full — even though the
 * owners and campaign-activity datasets are not downloadable until ISSUE-005 / ISSUE-006
 * ship. Declaring them now means "the columns the issue promised" cannot change between
 * phases: in phase 1 those two cards are disabled, so no partial file with a different
 * column set can ever exist. When W6/W7 wire the data in, only `sources.ts` and the row
 * builders in this file change — the column lists themselves do not move.
 */

export type ExportDatasetId = "parcels" | "owners" | "campaign-activity";

/**
 * Every column belongs to exactly one class, decided by its name suffix: no suffix ->
 * `county` (straight from the Rock Island County GIS parcel layer), `_mock` -> `mock`
 * (simulated by this application, never a real contact detail), `_crm` -> `crm` (a
 * record created inside this CRM). `export` is reserved for columns that describe the
 * file/row itself rather than an entity field (`export_scope`, `export_generated_at`,
 * and the per-row `source_system` / `simulated` provenance flags whose value does not
 * originate from any single entity record).
 */
export type ColumnClass = "county" | "mock" | "crm" | "export";

export type ExportColumn = { name: string; class: ColumnClass; note: string };

export type ExportScope =
  { kind: "all" } | { kind: "project"; id: string; name: string; slug: string };

export type ExportDataset = {
  id: ExportDatasetId;
  title: string;
  description: string;
  filenameStem: string;
  columns: ExportColumn[];
};

const PARCELS_COLUMNS: ExportColumn[] = [
  {
    name: "pin",
    class: "county",
    note: "The parcel identifier (PIN). The literal string UNKNOWN where the source has none — never synthesised.",
  },
  { name: "owner_name", class: "county", note: "The property owner's name (owner1_name)." },
  {
    name: "taxbill_name",
    class: "county",
    note: "The name on the tax bill (taxbill_name), which can differ from the owner name.",
  },
  {
    name: "assessed_value_eav",
    class: "county",
    note: "The assessed value (EAV), verbatim. A real 0 is a real tax-exempt value, not missing.",
  },
  { name: "market_value_emv", class: "county", note: "The market value (EMV), verbatim." },
  {
    name: "mailing_address",
    class: "county",
    note: "The tax-bill mailing street address (taxbill_addr).",
  },
  {
    name: "mailing_city_state_zip",
    class: "county",
    note: "The tax-bill city, state and ZIP as one combined string (taxbill_csz) — the source has no separate fields, and it is never split.",
  },
  {
    name: "acres",
    class: "county",
    note: "The parcel's acreage (GIS_acres_num). A value of 0 is treated as missing — a polygon cannot have zero area.",
  },
  {
    name: "project_names_crm",
    class: "crm",
    note: "Every saved project this parcel belongs to, semicolon-joined; empty when it is in none.",
  },
  { name: "county", class: "county", note: "The county name, Rock Island County, IL." },
  { name: "county_slug", class: "county", note: "The county slug, rock-island." },
  {
    name: "source_system",
    class: "county",
    note: "The literal source identifier rock-island-county-gis.",
  },
  {
    name: "source_layer_url",
    class: "county",
    note: "The ArcGIS FeatureServer URL this parcel data was retrieved from.",
  },
  {
    name: "source_retrieved_at",
    class: "county",
    note: "The timestamp the county layer was retrieved.",
  },
  {
    name: "export_scope",
    class: "export",
    note: "Whether this file covers all loaded parcels or one project (all, or project:<slug>).",
  },
  {
    name: "export_generated_at",
    class: "export",
    note: "The timestamp this file was generated, computed once per download.",
  },
];

const OWNERS_COLUMNS: ExportColumn[] = [
  { name: "owner_id_crm", class: "crm", note: "ISSUE-005's owner record id." },
  {
    name: "owner_name",
    class: "county",
    note: "The owner's county-sourced name (owner1_name) from their parcels.",
  },
  { name: "mailing_address", class: "county", note: "The tax-bill mailing street address." },
  {
    name: "mailing_city_state_zip",
    class: "county",
    note: "The combined tax-bill city, state and ZIP.",
  },
  {
    name: "parcel_count",
    class: "crm",
    note: "The number of parcels linked to this owner record.",
  },
  {
    name: "parcel_pins",
    class: "county",
    note: "Every linked parcel's PIN, ascending, semicolon-joined.",
  },
  {
    name: "total_acres",
    class: "crm",
    note: "The plain sum of the member parcels' acreage where present — no rounding.",
  },
  {
    name: "parcels_missing_acres",
    class: "crm",
    note: "How many member parcels contributed nothing to total_acres.",
  },
  {
    name: "email_mock",
    class: "mock",
    note: "ISSUE-005's mocked email address; not a real contact detail.",
  },
  {
    name: "phone_mock",
    class: "mock",
    note: "ISSUE-005's mocked phone number; not a real contact detail.",
  },
  {
    name: "contact_completeness_mock",
    class: "mock",
    note: "Whether the mocked contact record is complete or incomplete.",
  },
  {
    name: "contact_enriched_mock",
    class: "mock",
    note: "Whether the mocked buy/enrich flow ran for this owner (yes or no).",
  },
  {
    name: "contact_enriched_at_mock",
    class: "mock",
    note: "When the mocked enrichment ran, or empty when it never did.",
  },
  {
    name: "source_system",
    class: "export",
    note: "The literal rock-island-county-gis+parcel-crm-mock.",
  },
  {
    name: "export_scope",
    class: "export",
    note: "Whether this file covers all owners or one project (all, or project:<slug>).",
  },
  { name: "export_generated_at", class: "export", note: "The timestamp this file was generated." },
];

const CAMPAIGN_ACTIVITY_COLUMNS: ExportColumn[] = [
  { name: "event_id_mock", class: "mock", note: "ISSUE-006's event id." },
  { name: "campaign_id_mock", class: "mock", note: "ISSUE-006's campaign id." },
  { name: "campaign_name_mock", class: "mock", note: "ISSUE-006's campaign name." },
  {
    name: "channel_mock",
    class: "mock",
    note: "The outreach channel: email, direct-mail, or sms.",
  },
  { name: "message_id_mock", class: "mock", note: "ISSUE-006's message id." },
  {
    name: "message_subject_mock",
    class: "mock",
    note: "The message subject; empty for channels with no subject.",
  },
  {
    name: "message_body_mock",
    class: "mock",
    note: "A single-line rendering of the message body — every line break is replaced with one space.",
  },
  {
    name: "event_state_mock",
    class: "mock",
    note: "The lifecycle state of this event (sent, delivered, clicked, replied, bounced, or whatever else ISSUE-006 ships), written exactly as ISSUE-006 spells it.",
  },
  { name: "event_at_mock", class: "mock", note: "When this lifecycle event happened." },
  { name: "owner_id_crm", class: "crm", note: "The recipient owner record." },
  { name: "owner_name", class: "county", note: "The recipient's county-sourced name." },
  {
    name: "project_id_crm",
    class: "crm",
    note: "The project this campaign targeted; empty when it targeted an ad-hoc owner set.",
  },
  { name: "project_name_crm", class: "crm", note: "As above, by name." },
  {
    name: "simulated",
    class: "export",
    note: "The literal true, on every row — nothing here was ever sent.",
  },
  { name: "source_system", class: "export", note: "The literal parcel-crm-simulation." },
  {
    name: "export_scope",
    class: "export",
    note: "Whether this file covers all activity or one project (all, or project:<slug>).",
  },
  { name: "export_generated_at", class: "export", note: "The timestamp this file was generated." },
];

export const EXPORT_DATASETS: ExportDataset[] = [
  {
    id: "parcels",
    title: "Parcels",
    description:
      "Every loaded Rock Island County parcel: identifier, owner, assessed and market value, mailing address, and acreage, straight from the county layer.",
    filenameStem: "parcels",
    columns: PARCELS_COLUMNS,
  },
  {
    id: "owners",
    title: "Owners",
    description:
      "One row per owner CRM record: county name and mailing address, the parcels they own, and the mocked contact fields.",
    filenameStem: "owners",
    columns: OWNERS_COLUMNS,
  },
  {
    id: "campaign-activity",
    title: "Campaign activity",
    description:
      "One row per simulated outreach event: channel, message, lifecycle state, and timestamp. Nothing was ever sent.",
    filenameStem: "campaign-activity",
    columns: CAMPAIGN_ACTIVITY_COLUMNS,
  },
];

/** `name.toLowerCase()`, non-alphanumeric runs collapsed to one `-`, trimmed, capped at 40 chars. */
export function slugifyProject(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "unnamed"
  );
}

export function scopeCell(scope: ExportScope): string {
  return scope.kind === "all" ? "all" : `project:${scope.slug}`;
}

/** The scope, worded for the on-page result line — "all" or the project's display name. */
export function scopeLabel(scope: ExportScope): string {
  return scope.kind === "all" ? "all" : scope.name;
}

export function exportFilename(stem: string, scope: ExportScope, generatedAt: string): string {
  const scopeSuffix = scope.kind === "project" ? `_project-${scope.slug}` : "";
  return `parcel-crm_${stem}${scopeSuffix}_${generatedAt.slice(0, 10)}.csv`;
}

export function headerOf(dataset: ExportDataset): string[] {
  return dataset.columns.map((c) => c.name);
}

/** `state.present ? csvCell(state.value) : ""` — one expression, so no column can acquire a default. */
function fieldCell<T extends string | number>(state: FieldState<T>): string {
  return state.present ? csvCell(state.value) : "";
}

export type BuildParcelRowsInput = {
  parcels: Parcel[]; // already filtered to the scope by the caller
  meta: ParcelMeta;
  projectNamesByPin: Map<string, string[]>; // empty map until ISSUE-004 ships
  scope: ExportScope;
  generatedAt: string; // one ISO string per download
};

export function buildParcelRows(input: BuildParcelRowsInput): string[][] {
  const { parcels, meta, projectNamesByPin, scope, generatedAt } = input;
  const scopeValue = scopeCell(scope);

  return parcels.map((parcel) => [
    csvCell(parcel.pin),
    fieldCell(parcel.owner),
    fieldCell(parcel.taxBillName),
    fieldCell(parcel.assessedValue),
    fieldCell(parcel.marketValue),
    fieldCell(parcel.mailingStreet),
    fieldCell(parcel.mailingCityStateZip),
    fieldCell(parcel.acres),
    csvCell(projectNamesByPin.get(parcel.pin)?.join(";") ?? ""),
    csvCell(meta.countyName),
    csvCell(meta.county),
    csvCell("rock-island-county-gis"),
    csvCell(meta.sourceLayerUrl),
    csvCell(meta.retrievedAt),
    csvCell(scopeValue),
    csvCell(generatedAt),
  ]);
}

/**
 * W6 (ISSUE-005 gate). A local, structural type holding exactly the 13 data fields of the
 * owners column table — deliberately NOT ISSUE-005's own `OwnerRecord` type, so that a
 * later rename inside ISSUE-005 cannot silently change this file's column contract.
 * `sources.ts` is the only place that maps ISSUE-005's real record into this shape.
 */
export type OwnerExportRecord = {
  ownerIdCrm: string;
  ownerName: string;
  mailingAddress: string | null;
  mailingCityStateZip: string | null;
  parcelCount: number;
  parcelPins: string[]; // ascending
  totalAcres: number;
  parcelsMissingAcres: number;
  emailMock: string | null;
  phoneMock: string | null;
  contactCompletenessMock: "complete" | "incomplete";
  contactEnrichedMock: boolean;
  contactEnrichedAtMock: string | null;
};

export type BuildOwnerRowsInput = {
  owners: OwnerExportRecord[]; // already filtered to the scope by the caller
  scope: ExportScope;
  generatedAt: string;
};

export function buildOwnerRows(input: BuildOwnerRowsInput): string[][] {
  const { owners, scope, generatedAt } = input;
  const scopeValue = scopeCell(scope);

  return owners.map((owner) => [
    csvCell(owner.ownerIdCrm),
    csvCell(owner.ownerName),
    csvCell(owner.mailingAddress),
    csvCell(owner.mailingCityStateZip),
    csvCell(owner.parcelCount),
    csvCell(owner.parcelPins.join(";")),
    csvCell(owner.totalAcres),
    csvCell(owner.parcelsMissingAcres),
    csvCell(owner.emailMock),
    csvCell(owner.phoneMock),
    csvCell(owner.contactCompletenessMock),
    csvCell(owner.contactEnrichedMock ? "yes" : "no"),
    csvCell(owner.contactEnrichedAtMock),
    csvCell("rock-island-county-gis+parcel-crm-mock"),
    csvCell(scopeValue),
    csvCell(generatedAt),
  ]);
}

/**
 * W7 (ISSUE-006 gate). A local, structural type holding exactly the 13 data fields of the
 * campaign-activity column table — deliberately NOT ISSUE-006's own event/message/campaign
 * types. `sources.ts` maps one `CampaignEventExportRecord` per `LifecycleEvent` ISSUE-006
 * shipped, including `followup.scheduled` facts (a real event, even though it does not
 * establish a `MessageState`): `eventStateMock` carries the mapped `MessageState` when one
 * exists, or the literal fact-type string otherwise, so no lifecycle event is ever dropped
 * from "one row per simulated lifecycle event" and no state is ever invented.
 */
export type CampaignEventExportRecord = {
  eventIdMock: string;
  campaignIdMock: string;
  campaignNameMock: string;
  channelMock: string;
  messageIdMock: string;
  messageSubjectMock: string | null;
  messageBodyMock: string;
  eventStateMock: string;
  eventAtMock: string;
  ownerIdCrm: string;
  ownerName: string;
  projectIdCrm: string | null;
  projectNameCrm: string | null;
};

export type BuildCampaignActivityRowsInput = {
  events: CampaignEventExportRecord[]; // already filtered to the scope by the caller
  scope: ExportScope;
  generatedAt: string;
};

/**
 * The one declared normalisation in the whole export: every `\r\n` and `\n` in a mock
 * message body becomes a single space, so no exported cell ever contains a line break.
 * Applies to mock text only, never to a county value.
 */
function normaliseMessageBody(body: string): string {
  return body.replace(/\r\n|\n/g, " ");
}

export function buildCampaignActivityRows(input: BuildCampaignActivityRowsInput): string[][] {
  const { events, scope, generatedAt } = input;
  const scopeValue = scopeCell(scope);

  const sorted = [...events].sort((a, b) => {
    if (a.eventAtMock !== b.eventAtMock) return a.eventAtMock < b.eventAtMock ? -1 : 1;
    if (a.eventIdMock === b.eventIdMock) return 0;
    return a.eventIdMock < b.eventIdMock ? -1 : 1;
  });

  return sorted.map((event) => [
    csvCell(event.eventIdMock),
    csvCell(event.campaignIdMock),
    csvCell(event.campaignNameMock),
    csvCell(event.channelMock),
    csvCell(event.messageIdMock),
    csvCell(event.messageSubjectMock),
    csvCell(normaliseMessageBody(event.messageBodyMock)),
    csvCell(event.eventStateMock),
    csvCell(event.eventAtMock),
    csvCell(event.ownerIdCrm),
    csvCell(event.ownerName),
    csvCell(event.projectIdCrm),
    csvCell(event.projectNameCrm),
    csvCell("true"),
    csvCell("parcel-crm-simulation"),
    csvCell(scopeValue),
    csvCell(generatedAt),
  ]);
}
