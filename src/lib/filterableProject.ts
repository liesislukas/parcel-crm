import { numberField, type FieldState, type Parcel } from "@/lib/parcel";
import { computeProjectStats } from "@/lib/project";
import type { AdjacencyIndex } from "@/lib/adjacency";
import type { LngLat } from "@/lib/geo";
import { nearestPowerFeature, type PowerFeature } from "@/lib/power";
import {
  ACQUISITION_STAGES,
  COUNTY_VALUE,
  OUTREACH_STATUSES,
  type AcquisitionStage,
  type FilterableProject,
  type OutreachStatus,
} from "@/lib/projectFilters";
import { POWER_ACCESS_SOURCE } from "@/lib/powerAccess";

/**
 * ISSUE-008 Work item 0 — contract reconciliation against the REAL shipped code (base
 * commit 253f0af, ISSUE-004/005/006/007/010 all merged). This header records the three
 * facts Work item 0 requires, plus the power-amendment fact:
 *
 * - Storage key: `parcel-crm.projects.v1` (`PROJECTS_STORAGE_KEY` in `src/lib/projectStore.ts`).
 * - Loader: `loadProjects()` in `src/lib/projectStore.ts` — reads the `{ version: 1, projects }`
 *   envelope directly and returns `Project[]` (not wrapped). This module reads the same
 *   storage key independently via `loadSourceProjects` so it never imports React/DOM code
 *   from `projectStore.ts` and stays a pure reconciliation layer over whatever is in
 *   storage, malformed or not.
 * - `Project` type (`src/lib/project.ts`): `{ id, name, parcelIds: string[], pins?: string[],
 *   createdAt, updatedAt }` since ISSUE-013 — members are parcel ids (`String(OBJECTID)`),
 *   with `pins` kept read-only for projects saved before it. There is no embedded acreage
 *   field — `src/lib/project.ts` deliberately never stores acreage, blocks, or owner count;
 *   `computeProjectStats(parcelIds, parcelsById, adjacency)` recomputes them from the source
 *   parcels every time, summing acreage once per DISTINCT footprint (condo/PUD
 *   duplicate-outline correction). This adapter reuses that exact function for the acreage
 *   ladder's member rung — see the note above that ladder below for why a naive per-member
 *   sum would silently disagree with the acreage already shown on `/projects` and
 *   `/projects/[id]`.
 * - `src/app/projects/[id]/page.tsx` EXISTS — `hasProjectDetailRoute` is `true`.
 * - Sibling stores (coordinator amendment, unchanged by this file's header): `parcel-crm.acquisition.v1`
 *   in `src/lib/store.ts` (`AcquisitionStore.records` keyed by `entityKey = "<type>:<id>"`,
 *   so a project's record sits at `"project:<id>"`); `parcel-crm.campaigns.v1` in
 *   `src/lib/campaigns/store.ts` (`Campaign.projectId: string | null`). Neither store
 *   denormalises onto `parcel-crm.projects.v1`.
 * - POWER AMENDMENT (coordinator decision, 2026-08-12): ISSUE-010 has already shipped
 *   (`src/lib/power.ts`, `public/data/rock-island-power.json` — 107 substations, 315
 *   transmission lines). `POWER_ACCESS_SOURCE.loaded` is `true` (see `src/lib/powerAccess.ts`).
 *   `powerNearestMiles` is therefore COMPUTED here, per project, as the minimum
 *   `nearestPowerFeature` distance over the "substation" layer from the project's member
 *   parcel centroids — never read off a field that does not exist on the shipped `Project`
 *   type, and never invented when a centroid cannot be resolved.
 */

export type SourceProject = Record<string, unknown>;

/** A resolved parcel lookup: the loaded county records, the PIN index and the adjacency index. */
export type ParcelLookup = {
  parcelsById: Map<string, Parcel>;
  idsByPin: Map<string, string[]>;
  adjacency: AdjacencyIndex;
} | null;

/** The minimal sibling-store shapes this adapter reads. Never written by this module. */
export type CrmStores = {
  acquisition: { records: Record<string, { stage: string }> } | null;
  campaigns: {
    campaigns: { id: string; projectId: string | null }[];
    messages: { id: string; campaignId: string }[];
    events: { messageId: string; factType: string }[];
  } | null;
};

const PROJECTS_STORAGE_KEY = "parcel-crm.projects.v1";
const ACQUISITION_STORAGE_KEY = "parcel-crm.acquisition.v1";
const CAMPAIGNS_STORAGE_KEY = "parcel-crm.campaigns.v1";

/** Never throws. Returns `[]` for every failure mode; never writes. */
export function loadSourceProjects(storageKey: string = PROJECTS_STORAGE_KEY): SourceProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const envelope = parsed as { projects?: unknown };
    if (!Array.isArray(envelope.projects)) return [];
    return envelope.projects as SourceProject[];
  } catch {
    return [];
  }
}

/**
 * Reads the two sibling CRM stores independently — a malformed or absent store yields
 * `null` for that store only, never for both. Never writes.
 */
export function loadCrmStores(): CrmStores {
  const acquisition = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(ACQUISITION_STORAGE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as { version?: unknown; records?: unknown } | null;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        parsed.version !== 1 ||
        typeof parsed.records !== "object" ||
        parsed.records === null
      ) {
        return null;
      }
      return { records: parsed.records as Record<string, { stage: string }> };
    } catch {
      return null;
    }
  })();

  const campaigns = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as {
        version?: unknown;
        campaigns?: unknown;
        messages?: unknown;
        events?: unknown;
      } | null;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        parsed.version !== 1 ||
        !Array.isArray(parsed.campaigns) ||
        !Array.isArray(parsed.messages) ||
        !Array.isArray(parsed.events)
      ) {
        return null;
      }
      return {
        campaigns: parsed.campaigns as { id: string; projectId: string | null }[],
        messages: parsed.messages as { id: string; campaignId: string }[],
        events: parsed.events as { messageId: string; factType: string }[],
      };
    } catch {
      return null;
    }
  })();

  return { acquisition, campaigns };
}

/**
 * `true` iff at least one record has no `parcels` array, has no numeric combined-acreage
 * field, and does have a `parcelIds`, `parcelPins` or `pins` string array. This is the only
 * condition under which the explorer loads the committed parcel attributes file on
 * `/projects`.
 */
export function needsParcelLookup(projects: SourceProject[]): boolean {
  return projects.some((project) => {
    if (Array.isArray(project.parcels)) return false;
    const hasNumericAcreage =
      numberField(project.combinedAcres).present ||
      numberField(project.totalAcres).present ||
      numberField(project.acres).present;
    if (hasNumericAcreage) return false;
    return (
      isStringArray(project.parcelIds) ||
      isStringArray(project.pins) ||
      isStringArray(project.parcelPins)
    );
  });
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * The project's member parcel ids. A v2 project already stores them. A project saved before
 * ISSUE-013 stores PINs, which are mapped through `idsByPin` — a colliding PIN contributes
 * every record it names, because a v1 project could not distinguish them and dropping
 * records would understate acreage. Returns `null` when the record names no members at all.
 */
function resolveMemberIds(project: SourceProject, lookup: ParcelLookup): string[] | null {
  if (isStringArray(project.parcelIds)) return project.parcelIds;

  const pins = isStringArray(project.pins)
    ? project.pins
    : isStringArray(project.parcelPins)
      ? project.parcelPins
      : null;
  if (pins === null) return null;
  if (lookup === null) return [];

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const pin of pins) {
    for (const id of lookup.idsByPin.get(pin) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      resolved.push(id);
    }
  }
  return resolved;
}

function resolveOutreachRank(state: string | undefined): number {
  switch (state) {
    case "replied":
      return 4;
    case "clicked":
      return 3;
    case "delivered":
    case "received":
      return 2;
    case "sent":
      return 1;
    default:
      return 0;
  }
}

function rankToOutreach(rank: number): OutreachStatus | null {
  if (rank === 4) return "replied";
  if (rank === 3) return "clicked";
  if (rank === 2) return "delivered";
  if (rank === 1) return "sent";
  return null;
}

/** `entityKey({ type: "project", id })` inlined per the coordinator amendment's contract. */
function projectEntityKey(id: string): string {
  return `project:${id}`;
}

function campaignFactRank(factType: string): number {
  switch (factType) {
    case "message.replied":
      return 4;
    case "short_url.visited":
    case "portal.logged_in":
      return 3;
    case "message.delivered":
    case "message.opened":
      return 2;
    case "message.sent":
    case "message.queued":
      return 1;
    case "message.opted_out":
      return 0;
    default:
      return 0;
  }
}

function deriveOutreachFromCampaigns(
  id: string,
  campaigns: NonNullable<CrmStores["campaigns"]>,
): OutreachStatus {
  const projectCampaigns = campaigns.campaigns.filter((c) => c.projectId === id);
  if (projectCampaigns.length === 0) return "none";

  const campaignIds = new Set(projectCampaigns.map((c) => c.id));
  const messages = campaigns.messages.filter((m) => campaignIds.has(m.campaignId));
  const messageIds = new Set(messages.map((m) => m.id));
  const events = campaigns.events.filter((e) => messageIds.has(e.messageId));

  let maxRank = 0;
  let anyBounced = false;
  for (const event of events) {
    if (event.factType === "message.bounced") anyBounced = true;
    const rank = campaignFactRank(event.factType);
    if (rank > maxRank) maxRank = rank;
  }

  const ranked = rankToOutreach(maxRank);
  if (ranked !== null) return ranked;
  if (anyBounced) return "bounced";
  return messages.length > 0 ? "sent" : "none";
}

function toFilterableAcres(
  project: SourceProject,
  parcelLookup: ParcelLookup,
): { acres: FieldState<number>; acresParcelsWithSource: number; acresParcelsTotal: number } {
  // Rung 1: an already-denormalised `parcels` array carrying a FieldState-shaped `acres`
  // per entry. Not produced by the shipped `Project` type, but kept for a generic input
  // shape and documented per the original plan.
  if (Array.isArray(project.parcels) && project.parcels.length > 0) {
    const entries = project.parcels as { acres?: unknown }[];
    const first = entries[0];
    if (
      typeof first === "object" &&
      first !== null &&
      typeof (first as { acres?: unknown }).acres === "object" &&
      (first as { acres?: { present?: unknown } }).acres !== null &&
      typeof (first as { acres: { present?: unknown } }).acres.present === "boolean"
    ) {
      let withSource = 0;
      let sum = 0;
      for (const entry of entries) {
        const acresField = (entry as { acres?: { present: boolean; value?: number } }).acres;
        if (acresField && acresField.present === true && typeof acresField.value === "number") {
          withSource += 1;
          sum += acresField.value;
        }
      }
      return {
        acres: withSource > 0 ? { present: true, value: sum } : { present: false },
        acresParcelsWithSource: withSource,
        acresParcelsTotal: entries.length,
      };
    }
  }

  // Rung 2: `parcelIds` (or a legacy `pins`/`parcelPins`) string array — the shape the
  // shipped `Project` type actually uses. `computeProjectStats` (owned by ISSUE-004,
  // `src/lib/project.ts`) is reused here rather than a naive per-member sum: it sums
  // acreage once per DISTINCT parcel footprint, which matters because Rock Island County
  // files condominium/PUD units repeatedly against one outline (107 records against a
  // single 10.46-ac parcel). A naive sum would silently report a DIFFERENT "combined
  // acreage" than the one already shown on `/projects/[id]` for the same project —
  // reusing the shipped function is what keeps this filter's number honest and consistent
  // with the rest of the app.
  const memberIds = resolveMemberIds(project, parcelLookup);
  if (memberIds !== null) {
    if (parcelLookup === null) {
      return { acres: { present: false }, acresParcelsWithSource: 0, acresParcelsTotal: 0 };
    }
    const stats = computeProjectStats(memberIds, parcelLookup.parcelsById, parcelLookup.adjacency);
    const withSource = stats.members.length - stats.acreageMissingCount;
    return {
      acres: withSource > 0 ? { present: true, value: stats.combinedAcres } : { present: false },
      acresParcelsWithSource: withSource,
      acresParcelsTotal: memberIds.length,
    };
  }

  // Rung 3: a flat numeric field, first present wins. Used by test fixtures and any
  // future denormalised project shape.
  const combined = numberField(project.combinedAcres);
  const total = numberField(project.totalAcres);
  const plain = numberField(project.acres);
  const acres = combined.present ? combined : total.present ? total : plain;
  if (acres.present) {
    const parcelCount = Number(project.parcelCount) || 0;
    return { acres, acresParcelsWithSource: parcelCount, acresParcelsTotal: parcelCount };
  }

  // Rung 4: nothing usable.
  return { acres: { present: false }, acresParcelsWithSource: 0, acresParcelsTotal: 0 };
}

function toFilterablePower(
  project: SourceProject,
  parcelLookup: ParcelLookup,
  powerFeatures: PowerFeature[] | null,
): FieldState<number> {
  if (POWER_ACCESS_SOURCE.loaded === false) return { present: false };
  if (parcelLookup === null || powerFeatures === null) return { present: false };

  const memberIds = resolveMemberIds(project, parcelLookup);
  if (memberIds === null) return { present: false };

  const origins: { pin: string; centre: LngLat }[] = [];
  for (const id of memberIds) {
    const parcel = parcelLookup.parcelsById.get(id);
    // The two records with an empty ring have no centroid, so they contribute no origin.
    if (!parcel || parcel.centroid === null) continue;
    origins.push({ pin: parcel.pin, centre: parcel.centroid });
  }
  // A project whose member parcels have no centroid in the loaded data reads Unknown —
  // never 0, never invented. This is the power amendment's explicit rule.
  if (origins.length === 0) return { present: false };

  const nearest = nearestPowerFeature(origins, powerFeatures, "substation");
  if (nearest === null) return { present: false };

  return { present: true, value: nearest.metres / 1609.344 };
}

function toFilterableOutreach(
  project: SourceProject,
  id: string,
  crmStores: CrmStores,
): { outreachStatus: FieldState<OutreachStatus>; rawOutreach: string | null } {
  // Rung 1: an already-recognised value directly on the record.
  if (
    typeof project.outreachStatus === "string" &&
    (OUTREACH_STATUSES as readonly string[]).includes(project.outreachStatus)
  ) {
    return {
      outreachStatus: { present: true, value: project.outreachStatus as OutreachStatus },
      rawOutreach: null,
    };
  }

  // Rung 2 (coordinator amendment): derive from the campaigns store.
  if (crmStores.campaigns !== null) {
    return {
      outreachStatus: {
        present: true,
        value: deriveOutreachFromCampaigns(id, crmStores.campaigns),
      },
      rawOutreach: null,
    };
  }

  // Rung 3: a denormalised `messages` array on the record itself.
  if (Array.isArray(project.messages)) {
    const messages = project.messages as { state?: unknown; status?: unknown }[];
    if (messages.length === 0) {
      return { outreachStatus: { present: true, value: "none" }, rawOutreach: null };
    }
    let maxRank = 0;
    let anyBounced = false;
    for (const m of messages) {
      const stateValue =
        typeof m.state === "string" ? m.state : typeof m.status === "string" ? m.status : undefined;
      if (stateValue === "bounced") anyBounced = true;
      const rank = resolveOutreachRank(stateValue);
      if (rank > maxRank) maxRank = rank;
    }
    const ranked = rankToOutreach(maxRank);
    if (ranked !== null) {
      return { outreachStatus: { present: true, value: ranked }, rawOutreach: null };
    }
    if (anyBounced)
      return { outreachStatus: { present: true, value: "bounced" }, rawOutreach: null };
    return { outreachStatus: { present: true, value: "sent" }, rawOutreach: null };
  }

  // Rung 4: a non-empty but unrecognised string.
  if (typeof project.outreachStatus === "string" && project.outreachStatus.trim() !== "") {
    return { outreachStatus: { present: false }, rawOutreach: project.outreachStatus };
  }

  // Rung 5: nothing usable.
  return { outreachStatus: { present: false }, rawOutreach: null };
}

function toFilterableStage(
  project: SourceProject,
  id: string,
  crmStores: CrmStores,
): { acquisitionStage: FieldState<AcquisitionStage>; rawStage: string | null } {
  // Rung 1: an already-recognised value directly on the record.
  if (
    typeof project.acquisitionStage === "string" &&
    (ACQUISITION_STAGES as readonly string[]).includes(project.acquisitionStage)
  ) {
    return {
      acquisitionStage: { present: true, value: project.acquisitionStage as AcquisitionStage },
      rawStage: null,
    };
  }

  // Rung 2 (coordinator amendment): look up the acquisition store by entityKey.
  if (crmStores.acquisition !== null) {
    const record = crmStores.acquisition.records[projectEntityKey(id)];
    if (record !== undefined) {
      if ((ACQUISITION_STAGES as readonly string[]).includes(record.stage)) {
        return {
          acquisitionStage: { present: true, value: record.stage as AcquisitionStage },
          rawStage: null,
        };
      }
      return { acquisitionStage: { present: false }, rawStage: record.stage };
    }
    // No record for this project: it has never been touched by the acquisition
    // pipeline. ISSUE-007's own `defaultRecord` semantics say that reads as
    // "not-contacted" — this is not an invention, it mirrors the seed default.
    return { acquisitionStage: { present: true, value: "not-contacted" }, rawStage: null };
  }

  // Rung 3: a denormalised `stage` field on the record itself.
  if (
    typeof project.stage === "string" &&
    (ACQUISITION_STAGES as readonly string[]).includes(project.stage)
  ) {
    return {
      acquisitionStage: { present: true, value: project.stage as AcquisitionStage },
      rawStage: null,
    };
  }

  // Rung 4: a non-empty but unrecognised string in either field.
  const rawCandidate =
    typeof project.acquisitionStage === "string" && project.acquisitionStage.trim() !== ""
      ? project.acquisitionStage
      : typeof project.stage === "string" && project.stage.trim() !== ""
        ? project.stage
        : null;
  if (rawCandidate !== null) {
    return { acquisitionStage: { present: false }, rawStage: rawCandidate };
  }

  // Rung 5: nothing usable.
  return { acquisitionStage: { present: false }, rawStage: null };
}

export function toFilterableProject(
  project: SourceProject,
  parcelLookup: ParcelLookup,
  hasProjectDetailRoute: boolean,
  crmStores: CrmStores,
  powerFeatures: PowerFeature[] | null,
): FilterableProject | null {
  const idRaw = project.id;
  const projectIdRaw = project.projectId;
  const id =
    typeof idRaw === "string" && idRaw.length > 0
      ? idRaw
      : typeof projectIdRaw === "string" && projectIdRaw.length > 0
        ? projectIdRaw
        : null;
  if (id === null) return null;

  const name =
    typeof project.name === "string" && project.name.length > 0 ? project.name : `Project ${id}`;

  // Every parcel in this build comes from public/data/rock-island-parcels.meta.json, whose
  // "county" field is "rock-island" — so every project assembled from those parcels is in
  // Rock Island County. This is a fact read from the dataset, not an assumption.
  const county: FieldState<typeof COUNTY_VALUE> = { present: true, value: COUNTY_VALUE };

  const { acres, acresParcelsWithSource, acresParcelsTotal } = toFilterableAcres(
    project,
    parcelLookup,
  );
  const powerNearestMiles = toFilterablePower(project, parcelLookup, powerFeatures);
  const { outreachStatus, rawOutreach } = toFilterableOutreach(project, id, crmStores);
  const { acquisitionStage, rawStage } = toFilterableStage(project, id, crmStores);

  return {
    id,
    name,
    county,
    acres,
    acresParcelsWithSource,
    acresParcelsTotal,
    powerNearestMiles,
    outreachStatus,
    acquisitionStage,
    rawStage,
    rawOutreach,
    href: hasProjectDetailRoute ? `/projects/${id}` : null,
  };
}
