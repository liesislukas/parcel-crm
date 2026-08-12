/**
 * Types for the Rock Island County data-source inventory rendered at /sources.
 *
 * The data in `src/data/rock-island-sources.json` is a conversion of the source-discovery run's
 * machine-readable catalog (`docs/rock-island-sources.yaml` in the oracle pipeline repo). Every row
 * here traces back to a row there.
 */

export type SourceStatus =
  "available" | "geo-blocked" | "unreachable" | "restricted" | "no-public-source-found";

export type Feasibility =
  "download" | "ingest" | "runtime-fetch" | "not-feasible" | "undetermined-unreachable";

export type SourceRow = {
  id: string;
  category: string;
  name: string;
  publisher: string;
  url: string | null;
  accessMethod: string;
  status: SourceStatus;
  recordCount: number | null;
  /** "not-measured" when unmeasured — never "" and never "N/A". */
  throughput: string;
  constraints: string;
  licence: string;
  feasibility: Feasibility;
  /** ISO-8601 date. */
  verifiedAt: string;
};

export type SignalVerdict =
  "public-source-found" | "no-public-source-found" | "proxy-only-no-direct-source";

export type UnavailableSignal = {
  signal: string;
  assignmentLine: string;
  verdict: SignalVerdict;
  whatWasChecked: string;
  /** The literal sentence the UI shows when this signal is requested. */
  uiStatement: string;
};

export type SourceInventory = {
  county: string;
  countyName: string;
  generatedAt: string;
  egressCountry: string;
  egressNote: string;
  findingsDocUrl: string;
  sources: SourceRow[];
  unavailableSignals: UnavailableSignal[];
};

/**
 * The single source of status wording in the UI. No other copy for these states is permitted
 * anywhere else — one status must read the same on every surface.
 */
export function statusLabel(status: SourceRow["status"]): {
  text: string;
  tone: "ok" | "warn" | "gap";
} {
  switch (status) {
    case "available":
      return { text: "Available", tone: "ok" };
    case "geo-blocked":
      return { text: "Blocked from our egress", tone: "warn" };
    case "unreachable":
      return { text: "Unreachable from our egress", tone: "warn" };
    case "restricted":
      return { text: "Restricted access", tone: "warn" };
    case "no-public-source-found":
      return { text: "No public source found", tone: "gap" };
  }
}

/** Shown wherever a value is absent. Never a blank cell, never "N/A", never "0". */
export const ABSENT_VALUE = "not measured — see Probing limitation";

/** True when a recorded value carries no measurement and should render as {@link ABSENT_VALUE}. */
export function isUnmeasured(value: string): boolean {
  return value.trim().toLowerCase().startsWith("not-measured");
}
