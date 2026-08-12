import type { ContactCoverage, ContactField, Completeness, OwnerRecord } from "@/lib/owners";

/**
 * The only module that touches `localStorage`. Every key follows
 * `parcel-crm.<entity>.v1` (coordinator-normalized 2026-08-12 across ISSUE-004/005/006/007/008).
 */
export const STORAGE_PREFIX = "parcel-crm.";

/** Owned by ISSUE-005 (this issue). Simulated enrichment events, keyed by owner key. */
export const OWNER_ENRICHMENT_KEY = "parcel-crm.owner-enrichment.v1";

// RESERVED for ISSUE-004 (project grouping). Do not read or write it from this issue.
export const PROJECTS_KEY = "parcel-crm.projects.v1";

export const ENRICHMENT_PRICE_USD = 4;
export const ENRICHMENT_LATENCY_MS = 1200;
export const SIMULATED_VENDOR = "Simulated contact-data vendor (no external call made)";

export type EnrichmentEvent = {
  ownerKey: string;
  enrichedAt: string; // ISO 8601, captured by the caller at click time
  fieldsAdded: ContactField[]; // only the fields that were missing
  vendor: string; // always SIMULATED_VENDOR
  priceUsd: number; // always ENRICHMENT_PRICE_USD
  simulated: true; // literal true — never absent, never false
};

export type EnrichmentStore = {
  version: 1;
  events: Record<string, EnrichmentEvent>; // keyed by ownerKey
};

export type EffectiveContact = {
  email: string | null; // null === not on file
  phone: string | null;
  completeness: Completeness; // "complete" only when BOTH email and phone are non-null
  enrichedBy: EnrichmentEvent | null;
};

function isEnrichmentStore(value: unknown): value is EnrichmentStore {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; events?: unknown };
  return (
    candidate.version === 1 && typeof candidate.events === "object" && candidate.events !== null
  );
}

/**
 * Safe on the server and safe against corrupt data: absent `window`, an absent key, a
 * `JSON.parse` throw, or a wrong `version` all fall back to the empty store rather than
 * throwing. A user with a stale or hand-edited value must not see a blank page.
 */
export function readEnrichments(): EnrichmentStore {
  if (typeof window === "undefined") return { version: 1, events: {} };
  try {
    const raw = window.localStorage.getItem(OWNER_ENRICHMENT_KEY);
    if (raw === null) return { version: 1, events: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!isEnrichmentStore(parsed)) return { version: 1, events: {} };
    return parsed;
  } catch {
    return { version: 1, events: {} };
  }
}

/**
 * Reads, merges the one event by `ownerKey`, writes back, and returns the new store. The
 * `setItem` call is wrapped so a private-mode quota error still lets the UI update for the
 * current session.
 */
export function writeEnrichment(event: EnrichmentEvent): EnrichmentStore {
  const current = readEnrichments();
  const next: EnrichmentStore = {
    version: 1,
    events: { ...current.events, [event.ownerKey]: event },
  };
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OWNER_ENRICHMENT_KEY, JSON.stringify(next));
    }
  } catch {
    // Quota exceeded or storage disabled (e.g. private mode). The in-memory `next` value
    // still lets the current session render as enriched; it just won't persist.
  }
  return next;
}

export function clearEnrichments(): EnrichmentStore {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(OWNER_ENRICHMENT_KEY);
    }
  } catch {
    // Storage disabled — nothing to clear.
  }
  return { version: 1, events: {} };
}

export function missingFields(coverage: ContactCoverage): ContactField[] {
  if (coverage === "both") return [];
  if (coverage === "phone-only") return ["email"];
  return ["email", "phone"];
}

/**
 * Starts from the owner's base coverage (`phone` set when coverage is `both` or
 * `phone-only`; `email` set only when `both`), then, if an enrichment event exists for that
 * `ownerKey`, sets every field named in `fieldsAdded` from the owner's mocked values.
 */
export function effectiveContact(owner: OwnerRecord, store: EnrichmentStore): EffectiveContact {
  let email: string | null = owner.coverage === "both" ? owner.mockEmail : null;
  let phone: string | null =
    owner.coverage === "both" || owner.coverage === "phone-only" ? owner.mockPhone : null;

  const event = store.events[owner.ownerKey] ?? null;
  if (event) {
    if (event.fieldsAdded.includes("email")) email = owner.mockEmail;
    if (event.fieldsAdded.includes("phone")) phone = owner.mockPhone;
  }

  return {
    email,
    phone,
    completeness: email !== null && phone !== null ? "complete" : "incomplete",
    enrichedBy: event,
  };
}
