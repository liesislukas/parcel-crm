import { type FieldState } from "@/lib/parcel";

/**
 * POWER AMENDMENT (coordinator decision, 2026-08-12) — supersedes ISSUE-008's original
 * Work item 2, which shipped this module with `POWER_ACCESS_SOURCE = { loaded: false, ... }`
 * as a placeholder pending ISSUE-010.
 *
 * ISSUE-010 has already shipped on this branch's base commit: `src/lib/power.ts`
 * (`toPowerFeature`, `nearestPowerFeature`, the equirectangular distance maths) and
 * `public/data/rock-island-power.json` (107 substations, 315 transmission lines, real OSM
 * data via Overpass — see `public/data/rock-island-power.meta.json`). So this module now
 * ships the LOADED state, naming that real source.
 *
 * The values below mirror `public/data/rock-island-power.meta.json` (`source`,
 * `sourceLicense`, `sourceLicenseUrl`, `retrievedAt`) as static literals — the same pattern
 * `src/lib/projectFilters.ts` uses for `COUNTY_VALUE`/`COUNTY_LABEL` against
 * `rock-island-parcels.meta.json`. If that meta file's source values ever change, this
 * module's literals must be reconciled by hand; they are not read at import time because
 * this file must stay side-effect-free and importable from Node (`vitest`,
 * `environment: "node"`).
 *
 * `loaded: true` here means the SOURCE is loaded — it does not mean every project has a
 * power distance. A project's own `powerNearestMiles` can still be `{ present: false }`
 * when none of its member parcels resolve to a centroid in the loaded parcel data (see
 * `src/lib/filterableProject.ts`). That per-project absence is surfaced through the filter
 * engine's `hiddenAsUnknown.power` mechanism, never guessed, never `0`.
 */
export type PowerAccessSource =
  | { loaded: false; reason: string }
  | {
      loaded: true;
      sourceName: string;
      sourceLicense: string;
      sourceUrl: string;
      retrievedAt: string;
    };

export const POWER_ACCESS_SOURCE: PowerAccessSource = {
  loaded: true,
  sourceName: "OpenStreetMap (via Overpass API)",
  sourceLicense: "Open Database License (ODbL) v1.0",
  sourceUrl: "https://www.openstreetmap.org/copyright",
  retrievedAt: "2026-08-12T09:14:31.399Z",
};

export const POWER_UNKNOWN_LABEL = "Unknown — no power distance available for this project";

export const POWER_NO_DATA_BANNER =
  "No power-infrastructure data is loaded. No public substation or transmission source has " +
  "been confirmed for Rock Island County, IL yet, so every project's power access reads " +
  "Unknown. This filter stays disabled until a source is loaded — it will never guess a distance.";

/**
 * Never returns `0`, `—`, or an empty string for an absent value — an absent distance is
 * always stated in words.
 */
export function formatPowerAccess(miles: FieldState<number>): string {
  if (!miles.present) return POWER_UNKNOWN_LABEL;
  return `${miles.value.toFixed(2)} mi to nearest power infrastructure`;
}
