/**
 * The sole module that touches `localStorage`. Key convention: `parcel-crm.<entity>.v1`.
 *
 * This file is shared across issues. Each issue owns exactly one key and must not read or
 * write another issue's key.
 */

import type { AcquisitionRecord, ActivityEvent, Task } from "@/lib/crm/acquisition";
import { buildSeed } from "@/lib/crm/seed";

export const STORAGE_PREFIX = "parcel-crm."; // full keys follow parcel-crm.<entity>.v1

// RESERVED for ISSUE-005 (owner enrichment). Do not read or write it from ISSUE-007.
export const OWNER_ENRICHMENT_KEY = "parcel-crm.owner-enrichment.v1";
// RESERVED for ISSUE-004 (project grouping). Do not read or write it from ISSUE-007.
export const PROJECTS_KEY = "parcel-crm.projects.v1";
// Owned by ISSUE-007 (acquisition status and task assignment).
export const ACQUISITION_KEY = "parcel-crm.acquisition.v1";

export type AcquisitionStore = {
  version: 1;
  records: Record<string, AcquisitionRecord>;
  tasks: Task[];
  events: ActivityEvent[];
};

function seedStore(today: string): AcquisitionStore {
  const bundle = buildSeed(today);
  return { version: 1, ...bundle };
}

/**
 * Never throws. `today` is always supplied by the caller — this module calls neither
 * `Date.now()` nor `new Date()`, which is what keeps it testable under `environment: "node"`.
 */
export function readAcquisition(today: string): AcquisitionStore {
  if (typeof window === "undefined") return seedStore(today);

  const raw = window.localStorage.getItem(ACQUISITION_KEY);
  if (raw === null) {
    const seeded = seedStore(today);
    writeAcquisition(seeded);
    return seeded;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt value: return the seed for this read, but do not overwrite the corrupt string.
    return seedStore(today);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== 1
  ) {
    return seedStore(today);
  }

  const p = parsed as Partial<AcquisitionStore>;
  return {
    version: 1,
    records: p.records ?? {},
    tasks: p.tasks ?? [],
    events: p.events ?? [],
  };
}

export function writeAcquisition(store: AcquisitionStore): AcquisitionStore {
  try {
    window.localStorage.setItem(ACQUISITION_KEY, JSON.stringify(store));
  } catch {
    // Private-mode quota errors and similar: the UI still updates for the current session.
  }
  return store;
}

export function resetAcquisition(today: string): AcquisitionStore {
  const seeded = seedStore(today);
  writeAcquisition(seeded);
  return seeded;
}
