import { loadParcelData } from "@/lib/parcelData";
import { deriveOwners } from "@/lib/owners";
import { readAcquisition } from "@/lib/store";
import { todayIso } from "@/lib/crm/acquisition";
import { addProjectsIfAbsent, clearProjects, loadProjects, seedProjects } from "@/lib/projectStore";
import {
  CAMPAIGNS_STORAGE_KEY,
  clearToEmpty,
  createCampaigns,
  getSnapshot,
  runToCompletion,
} from "@/lib/campaigns/store";
import { readManifest, writeManifest } from "@/lib/demo/manifest";
import {
  SEEDED_CAMPAIGN_CHANNELS,
  SEEDED_CAMPAIGN_NAME,
  SEEDED_PROJECT_ID,
  SEEDED_PROJECT_SEEDS,
  pickSeedAudience,
  seedCampaignNowMs,
  seededProjects,
} from "@/lib/demo/seedData";

/**
 * Orchestrates the one-pass demo seed, its reset, and its restore across four localStorage
 * keys: `parcel-crm.acquisition.v1` (materialised via `readAcquisition`, never overwritten —
 * that function already no-ops when the key exists), `parcel-crm.projects.v1`,
 * `parcel-crm.campaigns.v1`, and the gate itself, `parcel-crm.demo-seed.v1`
 * (`src/lib/demo/manifest.ts`). This module never overwrites a store whose key already
 * holds a value.
 */

/** Builds the seeded campaign against the real owner directory and runs it to completion. */
async function seedTheCampaign(today: string): Promise<string[]> {
  const { parcels } = await loadParcelData();
  const audience = pickSeedAudience(deriveOwners(parcels));
  if (audience.length < 2) return [];

  const result = createCampaigns({
    name: SEEDED_CAMPAIGN_NAME,
    channels: SEEDED_CAMPAIGN_CHANNELS,
    audience,
    projectId: SEEDED_PROJECT_ID,
    projectName: "Columbia Business Park Assemblage",
    nowMs: seedCampaignNowMs(today),
  });
  runToCompletion();
  return result.campaignIds;
}

/**
 * Deduplicates concurrent callers within one page load, the same way `loadParcelData` in
 * `src/lib/parcelData.ts` deduplicates concurrent fetches: `null` until a pass starts, set
 * synchronously to the in-progress promise before this function's first `await`, cleared once
 * that promise settles.
 *
 * This is required, not belt-and-braces: `DemoSeedBoot` (root layout) and
 * `CampaignsWorkspace`'s own mount effect both call `ensureDemoSeed` on a `/campaigns` first
 * load. The campaign-creation branch below has a long `await loadParcelData()` gap between
 * reading `readManifest() !== null` and actually writing anything — without this guard, two
 * callers can both pass that check before either has written, and each independently creates
 * its own three campaigns (nine cards, not three; confirmed against the deployed runtime).
 * `seedProjects` itself needs no equivalent guard: it is a single synchronous
 * check-and-write with no `await` inside it, so it is already atomic under JS's
 * single-threaded execution model even when called from two racing callers.
 */
let inFlight: Promise<void> | null = null;

async function runSeedPass(today: string): Promise<void> {
  let projectIds: string[] = [];
  let campaignIds: string[] = [];

  try {
    // Required for AC4: `loadCrmStores()` in `src/lib/filterableProject.ts` reads
    // `parcel-crm.acquisition.v1` directly and never calls `readAcquisition` itself, so a
    // genuinely cold `/projects` load would otherwise never see this store materialise.
    readAcquisition(today);

    projectIds = seedProjects(seededProjects(today)) ? SEEDED_PROJECT_SEEDS.map((s) => s.id) : [];

    const seededProjectPresent = loadProjects().some((p) => p.id === SEEDED_PROJECT_ID);
    if (seededProjectPresent && window.localStorage.getItem(CAMPAIGNS_STORAGE_KEY) === null) {
      campaignIds = await seedTheCampaign(today);
    }
  } catch {
    // A seed failure must never blank a page — but it must not be recorded as success
    // either. The ~11 MB attrs fetch inside `seedTheCampaign` is aborted when the user
    // navigates away mid-seed; writing the "seeded" manifest here with an empty
    // `campaignIds` would permanently short-circuit every later load and leave
    // /campaigns silently empty in this browser (QA-reproduced, 2/2). Leave the
    // manifest absent instead: the next load retries. `seedProjects` and
    // `seedTheCampaign` both re-check their stores first, so a retry cannot duplicate.
    return;
  }

  writeManifest({
    version: 1,
    state: "seeded",
    at: new Date().toISOString(),
    projectIds,
    campaignIds,
  });
}

/** Runs at most once per browser. Safe to call from several components; the manifest gates it. */
export async function ensureDemoSeed(today: string = todayIso()): Promise<void> {
  if (typeof window === "undefined") return;
  if (readManifest() !== null) return;
  if (inFlight) return inFlight;

  inFlight = runSeedPass(today);
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Clears projects + campaigns to explicit empty and marks the manifest `cleared`. */
export function resetDemoData(): void {
  clearProjects();
  clearToEmpty();
  writeManifest({
    version: 1,
    state: "cleared",
    at: new Date().toISOString(),
    projectIds: [],
    campaignIds: [],
  });
}

/** Re-installs the seeded projects and campaign without deleting anything the user made. */
export async function restoreDemoData(today: string = todayIso()): Promise<void> {
  addProjectsIfAbsent(seededProjects(today));

  let campaignIds = readManifest()?.campaignIds ?? [];
  if (getSnapshot().campaigns.length === 0) {
    campaignIds = await seedTheCampaign(today);
  }

  writeManifest({
    version: 1,
    state: "seeded",
    at: new Date().toISOString(),
    projectIds: SEEDED_PROJECT_SEEDS.map((s) => s.id),
    campaignIds,
  });
}
