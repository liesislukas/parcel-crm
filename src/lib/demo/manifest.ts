/**
 * The single source of truth for "did we run the demo-seed pass, and what did it create" —
 * kept out of `src/lib/campaigns/store.ts`'s `Campaign` type on purpose, so that store's
 * shape and version never change for this issue's sake.
 */

export const DEMO_SEED_KEY = "parcel-crm.demo-seed.v1";

export type DemoSeedManifest = {
  version: 1;
  state: "seeded" | "cleared";
  at: string; // ISO 8601, supplied by the caller
  projectIds: string[]; // ids this deployment seeded, [] when it seeded none
  campaignIds: string[]; // campaign ids this deployment seeded, [] when it seeded none
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((entry) => typeof entry === "string");
}

function isDemoSeedManifest(v: unknown): v is DemoSeedManifest {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m.version === 1 &&
    (m.state === "seeded" || m.state === "cleared") &&
    typeof m.at === "string" &&
    isStringArray(m.projectIds) &&
    isStringArray(m.campaignIds)
  );
}

/** `null` for: no localStorage, key absent, JSON.parse throw, wrong version, wrong shape. Never throws. */
export function readManifest(): DemoSeedManifest | null {
  if (typeof globalThis.localStorage === "undefined") return null;
  try {
    const raw = globalThis.localStorage.getItem(DEMO_SEED_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDemoSeedManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort write; a quota/private-mode throw is swallowed. */
export function writeManifest(manifest: DemoSeedManifest): void {
  if (typeof globalThis.localStorage === "undefined") return;
  try {
    globalThis.localStorage.setItem(DEMO_SEED_KEY, JSON.stringify(manifest));
  } catch {
    // best-effort; quota exceeded or storage disabled (private mode)
  }
}

/** `true` when a manifest exists and lists this id in `campaignIds`. */
export function isSeededCampaignId(id: string): boolean {
  const manifest = readManifest();
  return manifest !== null && manifest.campaignIds.includes(id);
}
