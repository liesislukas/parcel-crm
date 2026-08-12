import type { Parcel } from "@/lib/parcel";
import { loadParcelData, type ParcelMeta } from "@/lib/parcelData";
import {
  EXPORT_DATASETS,
  buildCampaignActivityRows,
  buildOwnerRows,
  buildParcelRows,
  headerOf,
  slugifyProject,
  type CampaignEventExportRecord,
  type ExportDatasetId,
  type ExportScope,
  type OwnerExportRecord,
} from "./datasets";
import { buildOwnerRecords, type OwnerRecord } from "@/lib/owners";
import { effectiveContact, readEnrichments, type EnrichmentStore } from "@/lib/store";
import { factToState } from "@/lib/campaigns/model";
import { getSnapshot as getCampaignsSnapshot, type CampaignsState } from "@/lib/campaigns/store";
import { findProject, loadProjects, resolveProjectParcelIds } from "@/lib/projectStore";
import type { Project } from "@/lib/project";

/**
 * This file is the ONLY coupling point to ISSUE-004 (projects), ISSUE-005 (owners), and
 * ISSUE-006 (campaigns). Phase 2 (this build): all three have shipped, on base commit
 * 253f0af — owners and campaign-activity are wired to their real modules below, and
 * project scope reads ISSUE-004's saved projects. `csv.ts`, `datasets.ts`'s column
 * lists, and `ExportPanel.tsx` are untouched; only the row-builder calls and the mapping
 * functions in this file changed.
 */

export type Availability = { available: true } | { available: false; reason: string };
export type BuiltDataset = { header: string[]; rows: string[][] };
export type ProjectOption = { id: string; name: string; slug: string };
export type ProjectOptions =
  { available: true; options: ProjectOption[] } | { available: false; reason: string };

/** Mirrors `MapWorkspace.tsx` lines 44–61: same fetch paths, same error string, so the
 * export can never disagree with the map about what parcel data is loaded. */
async function loadParcelSource(): Promise<{
  parcels: Parcel[];
  meta: ParcelMeta;
  parcelsById: ReadonlyMap<string, Parcel>;
  idsByPin: ReadonlyMap<string, string[]>;
}> {
  const { parcels, meta, parcelsById, idsByPin } = await loadParcelData();
  return { parcels, meta, parcelsById, idsByPin };
}

/**
 * Synchronous and does no fetching, so the page can render disabled cards instantly.
 * Phase 2: ISSUE-004/005/006 have all shipped, so every dataset is available.
 */
export function datasetAvailability(id: ExportDatasetId): Availability {
  switch (id) {
    case "parcels":
      return { available: true };
    case "owners":
      return { available: true };
    case "campaign-activity":
      return { available: true };
  }
}

/** ISSUE-004's saved projects, one option per project, in ISSUE-004's stored (creation) order. */
export async function loadProjectOptions(): Promise<ProjectOptions> {
  const projects = loadProjects();
  return {
    available: true,
    options: projects.map((p) => ({ id: p.id, name: p.name, slug: slugifyProject(p.name) })),
  };
}

/**
 * The member parcel ids of one saved project, or an empty set when the project no longer
 * exists. A project saved before ISSUE-013 stores PINs, resolved here through `idsByPin`.
 */
function memberIds(projectId: string, idsByPin: ReadonlyMap<string, string[]>): Set<string> {
  const project = findProject(projectId);
  return new Set(project ? resolveProjectParcelIds(project, idsByPin) : []);
}

/**
 * Built from ALL saved projects (not just the scoped one), so an unscoped parcels export
 * still shows every parcel's project membership. Keyed by parcel id: PIN is not unique
 * county-wide, so a PIN-keyed map would attribute one project's parcel to another record.
 */
function buildProjectNamesByParcelId(
  projects: Project[],
  idsByPin: ReadonlyMap<string, string[]>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const project of projects) {
    for (const id of resolveProjectParcelIds(project, idsByPin)) {
      const existing = map.get(id);
      if (existing) existing.push(project.name);
      else map.set(id, [project.name]);
    }
  }
  return map;
}

/**
 * Maps ISSUE-005's `OwnerRecord` (see `@/lib/owners`) onto the export's local
 * `OwnerExportRecord` shape by meaning:
 * - `owner_id_crm` -> `record.ownerId` (the record's stable identifier).
 * - `owner_name` -> `record.ownerKey` (the trimmed county `owner1_name` the record was
 *   grouped by — this is also exactly the value ISSUE-006's `Owner.ownerName` carries for
 *   the same owner, since both group by the same trimmed field. `owner_id_crm` in the
 *   campaign-activity export below reconstructs this same id via
 *   `encodeURIComponent(ownerName)` so the two files join on `owner_id_crm`).
 * - `mailing_address` / `mailing_city_state_zip` -> the county mailing fields of the
 *   first member parcel (in ascending-pin order, ISSUE-005's own order) that has one.
 * - `email_mock` / `phone_mock` / `contact_completeness_mock` /
 *   `contact_enriched_mock` / `contact_enriched_at_mock` -> ISSUE-005's
 *   `effectiveContact()`, the same function the Owners page renders from, so the export
 *   never shows a contact value the UI itself would not show as "on file".
 */
function toOwnerExportRecord(record: OwnerRecord, store: EnrichmentStore): OwnerExportRecord {
  let mailingAddress: string | null = null;
  let mailingCityStateZip: string | null = null;
  for (const parcel of record.parcels) {
    if (parcel.mailingStreet.present) {
      mailingAddress = parcel.mailingStreet.value;
      mailingCityStateZip = parcel.mailingCityStateZip.present
        ? parcel.mailingCityStateZip.value
        : null;
      break;
    }
  }

  const contact = effectiveContact(record, store);
  const parcelsMissingAcres = record.parcels.filter((p) => !p.acres.present).length;

  return {
    ownerIdCrm: record.ownerId,
    ownerName: record.ownerKey,
    mailingAddress,
    mailingCityStateZip,
    parcelCount: record.parcelCount,
    parcelPins: record.parcels.map((p) => p.pin), // already ascending — buildOwnerRecords sorts by pin
    totalAcres: record.totalAcres,
    parcelsMissingAcres,
    emailMock: contact.email,
    phoneMock: contact.phone,
    contactCompletenessMock: contact.completeness,
    contactEnrichedMock: contact.enrichedBy !== null,
    contactEnrichedAtMock: contact.enrichedBy?.enrichedAt ?? null,
  };
}

/**
 * Maps ISSUE-006's `CampaignsState` (see `@/lib/campaigns/store`) onto one
 * `CampaignEventExportRecord` per `LifecycleEvent`, by meaning:
 * - `event_id_mock` / `event_at_mock` -> `event.eventIdentifier` / `event.effectiveAt`.
 * - `event_state_mock` -> `factToState(event.factType)`, ISSUE-006's own `MessageState`
 *   vocabulary (`queued`, `sent`, `delivered`, `opened`, `clicked`, `logged_in`,
 *   `replied`, `bounced`, `opted_out`), written exactly as ISSUE-006 spells it. The one
 *   fact type with no `MessageState` — `followup.scheduled`, which "annotates, not
 *   transitions" per `model.ts` — falls back to the literal fact-type string so that
 *   fact is still exported as a row (this file's judgement call: excluding it would
 *   silently drop a real simulated event; inventing a state for it would fabricate one).
 * - `campaign_id_mock` / `campaign_name_mock` / `project_id_crm` / `project_name_crm` ->
 *   the event's message's campaign.
 * - `channel_mock` -> `message.channel`, verbatim (`"direct_mail"`, not a re-spelled
 *   `"direct-mail"` — this plan's column table used the latter as prose before ISSUE-006
 *   shipped; the real value is exported unmodified per `provenance-honesty`).
 * - `owner_id_crm` -> `encodeURIComponent(message.ownerName)`. `message.ownerName` is the
 *   same trimmed county `owner1_name` ISSUE-005's `OwnerRecord.ownerKey` groups by, so
 *   recomputing `OwnerRecord.ownerId`'s exact formula here (rather than reusing
 *   `message.ownerKey`, which is ISSUE-006's own differently-shaped campaign-owner id)
 *   makes this file's `owner_id_crm` match the owners export's `owner_id_crm` for the
 *   same owner, so the two files can be joined on that column.
 */
function buildCampaignEventRecords(state: CampaignsState): CampaignEventExportRecord[] {
  const campaignById = new Map(state.campaigns.map((c) => [c.id, c]));
  const messageById = new Map(state.messages.map((m) => [m.id, m]));
  const records: CampaignEventExportRecord[] = [];

  for (const event of state.events) {
    const message = messageById.get(event.messageId);
    if (!message) continue;
    const campaign = campaignById.get(message.campaignId);
    if (!campaign) continue;

    records.push({
      eventIdMock: event.eventIdentifier,
      campaignIdMock: campaign.id,
      campaignNameMock: campaign.name,
      channelMock: message.channel,
      messageIdMock: message.id,
      messageSubjectMock: message.subject,
      messageBodyMock: message.body,
      eventStateMock: factToState(event.factType) ?? event.factType,
      eventAtMock: event.effectiveAt,
      ownerIdCrm: encodeURIComponent(message.ownerName),
      ownerName: message.ownerName,
      projectIdCrm: campaign.projectId,
      projectNameCrm: campaign.projectName,
    });
  }

  return records;
}

/**
 * The UI never calls this for a disabled card — `datasetAvailability` gates the button
 * itself — so the throw below is a guard, not a reachable path.
 */
export async function buildDataset(
  id: ExportDatasetId,
  scope: ExportScope,
  generatedAt: string,
): Promise<BuiltDataset> {
  const availability = datasetAvailability(id);
  if (!availability.available) {
    throw new Error(availability.reason);
  }

  switch (id) {
    case "parcels": {
      const { parcels, meta, idsByPin } = await loadParcelSource();
      const projects = loadProjects();
      const projectNamesByParcelId = buildProjectNamesByParcelId(projects, idsByPin);
      const ids = scope.kind === "project" ? memberIds(scope.id, idsByPin) : null;
      const scopedParcels = ids ? parcels.filter((p) => ids.has(p.id)) : parcels;
      const dataset = EXPORT_DATASETS.find((d) => d.id === "parcels")!;
      return {
        header: headerOf(dataset),
        rows: buildParcelRows({
          parcels: scopedParcels,
          meta,
          projectNamesByParcelId,
          scope,
          generatedAt,
        }),
      };
    }
    case "owners": {
      const { parcels, parcelsById, idsByPin } = await loadParcelSource();
      const records = buildOwnerRecords(parcels);
      const store = readEnrichments();
      // Owner records carry PINs, so the member ids are mapped back to the PINs they name.
      const ids = scope.kind === "project" ? memberIds(scope.id, idsByPin) : null;
      const pins = ids
        ? new Set([...ids].flatMap((id) => (parcelsById.has(id) ? [parcelsById.get(id)!.pin] : [])))
        : null;
      const scopedRecords = pins
        ? records.filter((r) => r.parcels.some((p) => pins.has(p.pin)))
        : records;
      const dataset = EXPORT_DATASETS.find((d) => d.id === "owners")!;
      return {
        header: headerOf(dataset),
        rows: buildOwnerRows({
          owners: scopedRecords.map((r) => toOwnerExportRecord(r, store)),
          scope,
          generatedAt,
        }),
      };
    }
    case "campaign-activity": {
      const state = getCampaignsSnapshot();
      const allRecords = buildCampaignEventRecords(state);
      const scopedRecords =
        scope.kind === "project"
          ? allRecords.filter((r) => r.projectIdCrm === scope.id)
          : allRecords;
      const dataset = EXPORT_DATASETS.find((d) => d.id === "campaign-activity")!;
      return {
        header: headerOf(dataset),
        rows: buildCampaignActivityRows({
          events: scopedRecords,
          scope,
          generatedAt,
        }),
      };
    }
  }
}
