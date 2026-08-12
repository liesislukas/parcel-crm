import { beforeEach, describe, expect, it } from "vitest";
import type { OwnerRecord } from "@/lib/owners";
import {
  clearEnrichments,
  effectiveContact,
  ENRICHMENT_PRICE_USD,
  type EnrichmentEvent,
  missingFields,
  OWNER_ENRICHMENT_KEY,
  readEnrichments,
  SIMULATED_VENDOR,
  writeEnrichment,
} from "@/lib/store";

/** Minimal in-memory `localStorage` stub, installed onto `globalThis.window` per test. */
class FakeLocalStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function makeOwner(overrides: Partial<OwnerRecord> & { ownerKey: string }): OwnerRecord {
  return {
    ownerKey: overrides.ownerKey,
    ownerId: encodeURIComponent(overrides.ownerKey),
    parcels: overrides.parcels ?? [],
    parcelCount: overrides.parcelCount ?? 1,
    totalAcres: overrides.totalAcres ?? 0,
    mailingAddresses: overrides.mailingAddresses ?? [],
    coverage: overrides.coverage ?? "none",
    mockEmail: overrides.mockEmail ?? `${overrides.ownerKey.toLowerCase()}@mock.invalid`,
    mockPhone: overrides.mockPhone ?? "(309) 555-0100",
  };
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: new FakeLocalStorage(),
  };
});

describe("readEnrichments — server and corrupt-data safety", () => {
  it("returns the empty store when `window` is undefined (server-side)", () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(readEnrichments()).toEqual({ version: 1, events: {} });
  });

  it("returns the empty store on a fresh read", () => {
    expect(readEnrichments()).toEqual({ version: 1, events: {} });
  });

  it("returns the empty store instead of throwing on a corrupt string", () => {
    const win = (globalThis as unknown as { window: { localStorage: FakeLocalStorage } }).window;
    win.localStorage.setItem(OWNER_ENRICHMENT_KEY, "{not json");
    expect(readEnrichments()).toEqual({ version: 1, events: {} });
  });

  it("returns the empty store when the version does not match", () => {
    const win = (globalThis as unknown as { window: { localStorage: FakeLocalStorage } }).window;
    win.localStorage.setItem(OWNER_ENRICHMENT_KEY, JSON.stringify({ version: 2, events: {} }));
    expect(readEnrichments()).toEqual({ version: 1, events: {} });
  });
});

describe("writeEnrichment / clearEnrichments", () => {
  it("round-trips an event through readEnrichments", () => {
    const event: EnrichmentEvent = {
      ownerKey: "ROUND TRIP OWNER",
      enrichedAt: "2026-08-12T00:00:00.000Z",
      fieldsAdded: ["email", "phone"],
      vendor: SIMULATED_VENDOR,
      priceUsd: ENRICHMENT_PRICE_USD,
      simulated: true,
    };
    const written = writeEnrichment(event);
    expect(written.events["ROUND TRIP OWNER"]).toEqual(event);
    expect(readEnrichments().events["ROUND TRIP OWNER"]).toEqual(event);
  });

  it("empties the store", () => {
    writeEnrichment({
      ownerKey: "TO BE CLEARED",
      enrichedAt: "2026-08-12T00:00:00.000Z",
      fieldsAdded: ["email"],
      vendor: SIMULATED_VENDOR,
      priceUsd: ENRICHMENT_PRICE_USD,
      simulated: true,
    });
    const cleared = clearEnrichments();
    expect(cleared).toEqual({ version: 1, events: {} });
    expect(readEnrichments()).toEqual({ version: 1, events: {} });
  });
});

describe("missingFields", () => {
  it("returns the right fields for all three coverage states", () => {
    expect(missingFields("both")).toEqual([]);
    expect(missingFields("phone-only")).toEqual(["email"]);
    expect(missingFields("none")).toEqual(["email", "phone"]);
  });
});

describe("effectiveContact", () => {
  it("is incomplete for a 'none' owner with no enrichment event", () => {
    const owner = makeOwner({ ownerKey: "NONE OWNER", coverage: "none" });
    const store = { version: 1 as const, events: {} };
    const result = effectiveContact(owner, store);
    expect(result).toEqual({
      email: null,
      phone: null,
      completeness: "incomplete",
      enrichedBy: null,
    });
  });

  it("becomes complete for the same owner once an event adds both fields", () => {
    const owner = makeOwner({ ownerKey: "NONE OWNER", coverage: "none" });
    const event: EnrichmentEvent = {
      ownerKey: "NONE OWNER",
      enrichedAt: "2026-08-12T00:00:00.000Z",
      fieldsAdded: ["email", "phone"],
      vendor: SIMULATED_VENDOR,
      priceUsd: ENRICHMENT_PRICE_USD,
      simulated: true,
    };
    const store = { version: 1 as const, events: { "NONE OWNER": event } };
    const result = effectiveContact(owner, store);
    expect(result.email).toBe(owner.mockEmail);
    expect(result.phone).toBe(owner.mockPhone);
    expect(result.completeness).toBe("complete");
    expect(result.enrichedBy).toEqual(event);
  });

  it("is complete for a 'both' owner with no event present", () => {
    const owner = makeOwner({ ownerKey: "BOTH OWNER", coverage: "both" });
    const store = { version: 1 as const, events: {} };
    const result = effectiveContact(owner, store);
    expect(result.email).toBe(owner.mockEmail);
    expect(result.phone).toBe(owner.mockPhone);
    expect(result.completeness).toBe("complete");
    expect(result.enrichedBy).toBeNull();
  });
});
