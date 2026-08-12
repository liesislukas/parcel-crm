import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_SEED_KEY,
  isSeededCampaignId,
  readManifest,
  writeManifest,
  type DemoSeedManifest,
} from "./manifest";

/**
 * `vitest.config.ts` sets `environment: "node"`, so there is no real `localStorage`. This
 * stub is copied from `src/lib/projectStore.test.ts`'s `installLocalStorageStub` on purpose
 * — the repo's specs duplicate this helper rather than sharing it.
 */
function installLocalStorageStub(): void {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installLocalStorageStub();
});

describe("manifest", () => {
  it("returns null on an empty store", () => {
    expect(readManifest()).toBeNull();
  });

  it("returns null on non-JSON content", () => {
    globalThis.localStorage.setItem(DEMO_SEED_KEY, "not json");
    expect(readManifest()).toBeNull();
  });

  it("returns null on the wrong version", () => {
    globalThis.localStorage.setItem(DEMO_SEED_KEY, '{"version":2}');
    expect(readManifest()).toBeNull();
  });

  it("round-trips a write through a read", () => {
    const manifest: DemoSeedManifest = {
      version: 1,
      state: "seeded",
      at: "2026-08-12T09:00:00.000Z",
      projectIds: ["columbia-business-park", "rock-island-0736101-assemblage"],
      campaignIds: ["camp-1", "camp-2", "camp-3"],
    };
    writeManifest(manifest);
    expect(readManifest()).toEqual(manifest);
  });

  it("isSeededCampaignId is true for a listed id, false for an unlisted one, false with no manifest", () => {
    expect(isSeededCampaignId("camp-1")).toBe(false);

    writeManifest({
      version: 1,
      state: "seeded",
      at: "2026-08-12T09:00:00.000Z",
      projectIds: [],
      campaignIds: ["camp-1"],
    });

    expect(isSeededCampaignId("camp-1")).toBe(true);
    expect(isSeededCampaignId("camp-2")).toBe(false);
  });
});
