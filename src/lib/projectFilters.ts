import type { FieldState } from "@/lib/parcel";

/**
 * ISSUE-008 — the single owner of every filter literal, every URL param name, and the
 * matching rules for the Projects list. Pure and Node-safe: no React, no `next/*`, no
 * `window`, no `localStorage`. `vitest` (`environment: "node"`) exercises this module
 * directly in `projectFilters.test.ts`.
 */

export const COUNTY_VALUE = "rock-island"; // matches public/data/rock-island-parcels.meta.json "county"
export const COUNTY_LABEL = "Rock Island County, IL"; // matches meta.json "countyName"

export const ACQUISITION_STAGES = [
  "not-contacted",
  "contacted",
  "negotiating",
  "under-contract",
  "closed-won",
  "closed-lost",
] as const;
export type AcquisitionStage = (typeof ACQUISITION_STAGES)[number];
export const ACQUISITION_STAGE_LABELS: Record<AcquisitionStage, string> = {
  "not-contacted": "Not contacted",
  contacted: "Contacted",
  negotiating: "Negotiating",
  "under-contract": "Under contract",
  "closed-won": "Closed — won",
  "closed-lost": "Closed — lost",
};

export const OUTREACH_STATUSES = [
  "none",
  "sent",
  "delivered",
  "clicked",
  "replied",
  "bounced",
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  none: "No outreach yet",
  sent: "Sent",
  delivered: "Delivered / received",
  clicked: "Short link clicked",
  replied: "Replied",
  bounced: "Bounced",
};

export const POWER_DISTANCE_OPTIONS = [1, 3, 10] as const; // statute miles

export type FilterableProject = {
  id: string;
  name: string;
  county: FieldState<typeof COUNTY_VALUE>;
  acres: FieldState<number>;
  acresParcelsWithSource: number;
  acresParcelsTotal: number;
  powerNearestMiles: FieldState<number>;
  outreachStatus: FieldState<OutreachStatus>;
  acquisitionStage: FieldState<AcquisitionStage>;
  rawStage: string | null; // a stage string the vocabulary does not recognise
  rawOutreach: string | null; // an outreach string the vocabulary does not recognise
  href: string | null; // set by the adapter, not by this module
};

export type ProjectFilterState = {
  county: typeof COUNTY_VALUE | "all";
  acresMin: number | null;
  acresMax: number | null;
  powerMaxMiles: number | null;
  includeUnknownPower: boolean;
  outreach: OutreachStatus[];
  stages: AcquisitionStage[];
};

export type DimensionKey = "county" | "acres" | "power" | "outreach" | "stage";

export type FilterOutcome = {
  matched: FilterableProject[];
  total: number;
  hiddenAsUnknown: Record<DimensionKey, number>;
  unrecognisedStages: string[]; // sorted, de-duplicated
};

export const DEFAULT_FILTER_STATE: ProjectFilterState = {
  county: "all",
  acresMin: null,
  acresMax: null,
  powerMaxMiles: null,
  includeUnknownPower: true,
  outreach: [],
  stages: [],
};

/** `Number.parseFloat`, rejected to `null` on non-finite or negative results. */
function parsePositiveFloat(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseFilterState(params: URLSearchParams): ProjectFilterState {
  const countyRaw = params.get("county");
  const county = countyRaw === COUNTY_VALUE ? COUNTY_VALUE : "all";

  const acresMin = parsePositiveFloat(params.get("acresMin"));
  const acresMax = parsePositiveFloat(params.get("acresMax"));

  const powerMilesRaw = params.get("powerMiles");
  const powerMaxMiles = (POWER_DISTANCE_OPTIONS as readonly number[]).includes(
    Number(powerMilesRaw),
  )
    ? Number(powerMilesRaw)
    : null;

  const includeUnknownPower = params.get("powerUnknown") !== "exclude";

  const outreachRaw = params.get("outreach");
  const outreachValues = outreachRaw === null ? [] : outreachRaw.split(",");
  const outreach = OUTREACH_STATUSES.filter((s) => outreachValues.includes(s));

  const stageRaw = params.get("stage");
  const stageValues = stageRaw === null ? [] : stageRaw.split(",");
  const stages = ACQUISITION_STAGES.filter((s) => stageValues.includes(s));

  return {
    county,
    acresMin,
    acresMax,
    powerMaxMiles,
    includeUnknownPower,
    outreach,
    stages,
  };
}

export function toSearchParams(state: ProjectFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.county !== "all") params.set("county", state.county);
  if (state.acresMin !== null) params.set("acresMin", String(state.acresMin));
  if (state.acresMax !== null) params.set("acresMax", String(state.acresMax));
  if (state.powerMaxMiles !== null) params.set("powerMiles", String(state.powerMaxMiles));
  if (!state.includeUnknownPower) params.set("powerUnknown", "exclude");
  if (state.outreach.length > 0) {
    params.set("outreach", OUTREACH_STATUSES.filter((s) => state.outreach.includes(s)).join(","));
  }
  if (state.stages.length > 0) {
    params.set("stage", ACQUISITION_STAGES.filter((s) => state.stages.includes(s)).join(","));
  }

  return params;
}

export function isRangeInverted(state: ProjectFilterState): boolean {
  return state.acresMin !== null && state.acresMax !== null && state.acresMin > state.acresMax;
}

/**
 * Matching rules, evaluated in this fixed order — county, acres, power, outreach, stage —
 * first failure wins for attribution, so a project unknown in two dimensions is counted
 * once. `unrecognisedStages` collects every non-null `rawStage` across ALL input projects,
 * not only matched ones.
 */
export function applyFilters(
  projects: FilterableProject[],
  state: ProjectFilterState,
): FilterOutcome {
  const hiddenAsUnknown: Record<DimensionKey, number> = {
    county: 0,
    acres: 0,
    power: 0,
    outreach: 0,
    stage: 0,
  };

  const matched: FilterableProject[] = [];

  for (const project of projects) {
    let pass = true;

    // 1. county
    if (pass && state.county !== "all") {
      if (!project.county.present) {
        hiddenAsUnknown.county += 1;
        pass = false;
      } else if (project.county.value !== state.county) {
        pass = false;
      }
    }

    // 2. acres
    if (pass && (state.acresMin !== null || state.acresMax !== null)) {
      if (!project.acres.present) {
        hiddenAsUnknown.acres += 1;
        pass = false;
      } else {
        const v = project.acres.value;
        const withinMin = state.acresMin === null || v >= state.acresMin;
        const withinMax = state.acresMax === null || v <= state.acresMax;
        if (!withinMin || !withinMax) pass = false;
      }
    }

    // 3. power
    if (pass && state.powerMaxMiles !== null) {
      if (!project.powerNearestMiles.present) {
        if (!state.includeUnknownPower) {
          hiddenAsUnknown.power += 1;
          pass = false;
        }
      } else if (project.powerNearestMiles.value > state.powerMaxMiles) {
        pass = false;
      }
    }

    // 4. outreach
    if (pass && state.outreach.length > 0) {
      if (!project.outreachStatus.present) {
        hiddenAsUnknown.outreach += 1;
        pass = false;
      } else if (!state.outreach.includes(project.outreachStatus.value)) {
        pass = false;
      }
    }

    // 5. stage
    if (pass && state.stages.length > 0) {
      if (!project.acquisitionStage.present) {
        hiddenAsUnknown.stage += 1;
        pass = false;
      } else if (!state.stages.includes(project.acquisitionStage.value)) {
        pass = false;
      }
    }

    if (pass) matched.push(project);
  }

  const unrecognisedStages = [
    ...new Set(projects.map((p) => p.rawStage).filter((s): s is string => s !== null)),
  ].sort((a, b) => a.localeCompare(b));

  return { matched, total: projects.length, hiddenAsUnknown, unrecognisedStages };
}

export function activeFilterCount(state: ProjectFilterState): number {
  let count = 0;
  if (state.county !== "all") count += 1;
  if (state.acresMin !== null || state.acresMax !== null) count += 1;
  if (state.powerMaxMiles !== null) count += 1;
  if (state.includeUnknownPower === false) count += 1;
  if (state.outreach.length > 0) count += 1;
  if (state.stages.length > 0) count += 1;
  return count;
}
