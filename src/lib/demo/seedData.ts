import type { Project } from "@/lib/project";
import type { Owner } from "@/lib/owners";
import type { Channel } from "@/lib/campaigns/model";
import { addDaysIso } from "@/lib/crm/acquisition";

/**
 * ISSUE-014, adapted for ISSUE-013 (county-wide PMTiles + columnar attributes sidecar,
 * `public/data/rock-island-parcels.attrs.json`; the old `rock-island-parcels.json` GeoJSON
 * is deleted). Every PIN, owner name and mailing detail below is copied verbatim from that
 * sidecar — none of it is invented — and `seedData.test.ts` checks every one of them
 * against the committed file.
 *
 * Parcel identity in this build is `id` = `String(OBJECTID)`, never PIN (PIN is not unique
 * county-wide — `src/lib/parcel.ts`), and `src/lib/project.ts`'s `Project` type stores
 * `parcelIds: string[]`, not `pins`. Each seed below therefore carries BOTH: `pins`, for
 * human-readable documentation and for the test that resolves and verifies them, and the
 * `parcelIds` that get written to storage — the six PINs resolved to their one matching
 * OBJECTID apiece, baked in as literals rather than resolved via `loadParcelData()` at seed
 * time, so this module stays pure (no `fetch`, no DOM, no storage, node-testable alone).
 *
 * `SEEDED_AUDIENCE_OWNER_NAMES` is the 7 owners of the 13-parcel adjacency closure around
 * the Columbia Business Park assemblage (`src/lib/adjacency.ts`'s `connectedBlocks` rule,
 * shared-segment at 6-decimal precision). It was originally computed against the
 * 6,026-parcel subset that predated ISSUE-013; re-run against the full 65,955-parcel county
 * graph it resolves to the exact same 13 ids and the exact same 7 owner names — the closure
 * never reaches a parcel outside that original subset. Order is load-bearing: it fixes the
 * simulated per-recipient outcome in `src/lib/campaigns/simulate.ts` (`recipientIndex % 8`).
 */

export const SEEDED_PROJECT_ID = "columbia-business-park";
export const SEEDED_PROJECT_B_ID = "rock-island-0736101-assemblage";

export type SeededProjectSeed = {
  id: string;
  name: string;
  /** Verbatim county PINs — documentation and test-verification only; never written directly. */
  pins: string[];
  /** What `Project.parcelIds` actually stores: each PIN's one resolved `id` (`String(OBJECTID)`), same order as `pins`. */
  parcelIds: string[];
  createdOffsetDays: number; // negative = days before `today`
};

export const SEEDED_PROJECT_SEEDS: SeededProjectSeed[] = [
  {
    id: SEEDED_PROJECT_ID,
    name: "Columbia Business Park Assemblage",
    pins: ["0831108001", "0831108002", "0831108003"],
    parcelIds: ["47384", "47383", "47381"],
    createdOffsetDays: -12,
  },
  {
    id: SEEDED_PROJECT_B_ID,
    name: "Rock Island 07-36-101 Assemblage",
    pins: ["0736101015", "0736101016", "0736101017"],
    parcelIds: ["31729", "27605", "31736"],
    createdOffsetDays: -6,
  },
];

export const SEEDED_CAMPAIGN_NAME = "Columbia Business Park owner outreach";
export const SEEDED_CAMPAIGN_CHANNELS: Channel[] = ["email", "sms", "direct_mail"];
export const SEEDED_CAMPAIGN_START_OFFSET_DAYS = -5;

/** Verbatim `owner1_name` values. Order is load-bearing: it fixes the simulated outcomes. */
export const SEEDED_AUDIENCE_OWNER_NAMES: string[] = [
  "COLUMBIA BUSINESS PARK LLC",
  "MCRE 44 LLC",
  "CITY OF ROCK ISLAND",
  "LRC HV LLC",
  "CRESTHILL PRESERV GRP LLC",
  "RI METROPOLITAN MASS TRAN",
  "IA IL GAS & ELECTRIC CO",
];

/** `Project[]` ready to write. `seeded: true` on every entry. `updatedAt === createdAt`. */
export function seededProjects(today: string): Project[] {
  return SEEDED_PROJECT_SEEDS.map((seed) => {
    const at = `${addDaysIso(today, seed.createdOffsetDays)}T09:00:00.000Z`;
    return {
      id: seed.id,
      name: seed.name,
      parcelIds: [...seed.parcelIds],
      createdAt: at,
      updatedAt: at,
      seeded: true as const,
    };
  });
}

/** Exact `ownerName` match, in `SEEDED_AUDIENCE_OWNER_NAMES` order. Unmatched names dropped. */
export function pickSeedAudience(owners: Owner[]): Owner[] {
  const byName = new Map(owners.map((o) => [o.ownerName, o]));
  const picked: Owner[] = [];
  for (const name of SEEDED_AUDIENCE_OWNER_NAMES) {
    const owner = byName.get(name);
    if (owner) picked.push(owner);
  }
  return picked;
}

/** `Date.parse(`${addDaysIso(today, SEEDED_CAMPAIGN_START_OFFSET_DAYS)}T09:00:00.000Z`)` */
export function seedCampaignNowMs(today: string): number {
  return Date.parse(`${addDaysIso(today, SEEDED_CAMPAIGN_START_OFFSET_DAYS)}T09:00:00.000Z`);
}
