"use client";

import { useCallback, useSyncExternalStore } from "react";
import { resetDemoData, restoreDemoData } from "@/lib/demo/ensureSeed";
import { loadProjects } from "@/lib/projectStore";
import { SEEDED_PROJECT_ID } from "@/lib/demo/seedData";

/**
 * Deviation from the plan: a plain `useState` + `useEffect(() => setState(...), [])` one-shot
 * read trips this repo's `react-hooks/set-state-in-effect` lint rule (eslint-plugin-react-hooks
 * 7.1.1, pinned in package.json — newer than the plan). The codebase's own established idiom
 * for a hydration-safe one-shot external read is `useSyncExternalStore` (see
 * `SimulationControls.tsx`, `ContactHistory.tsx`); `subscribeToNothing` never notifies, so the
 * value is (re-)read only on mount/hydration, matching the plan's intended behaviour exactly.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

function getSeededPresentSnapshot(): boolean {
  return loadProjects().some((p) => p.id === SEEDED_PROJECT_ID);
}

/** `true` on the server and on the first client paint — hides the restore button until the
 * post-hydration check on the client proves it should show, exactly like the plan's `null`
 * initial state did. */
function getSeededPresentServerSnapshot(): boolean {
  return true;
}

const RESET_CONFIRM =
  'Clear the seeded demo projects and every simulated campaign in this browser, leaving both pages empty? Acquisition records and tasks are not affected — use "Reset acquisition demo data" on the Acquisitions page for those. This cannot be undone.';

const BUTTON_CLASS = "rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25";

const PROJECTS_COPY =
  "Two example projects are seeded into this browser the first time you open the app, so the filters and the export have something real to work on. Both are badged SEEDED, both are assembled from real Rock Island County GIS parcels with their real combined acreage, and neither was created by you. Projects you create yourself are never overwritten and never badged. Projects are saved in this browser only — this deployment has no server database, so nothing here appears in another browser, another device, or a private window.";

const CAMPAIGNS_COPY =
  "The campaigns badged SEEDED were generated in this browser the first time you opened the app and run to completion by the in-app simulator, so the lifecycle counts are populated before you do anything. Nothing was ever sent. Campaigns you create yourself are never overwritten and never badged. Campaigns are stored in this browser only, under the localStorage key parcel-crm.campaigns.v1 — this deployment has no server database, so nothing here appears in another browser, another device, or a private window.";

export function DemoDataNotice({ surface }: { surface: "projects" | "campaigns" }) {
  const seededPresent = useSyncExternalStore(
    subscribeToNothing,
    getSeededPresentSnapshot,
    getSeededPresentServerSnapshot,
  );

  const handleReset = useCallback(() => {
    if (!window.confirm(RESET_CONFIRM)) return;
    resetDemoData();
    window.location.reload();
  }, []);

  const handleRestore = useCallback(() => {
    void restoreDemoData().then(() => window.location.reload());
  }, []);

  return (
    <section
      data-testid="demo-data-notice"
      className="rounded-lg border border-black/10 p-3 text-xs leading-relaxed dark:border-white/15"
    >
      <p>{surface === "projects" ? PROJECTS_COPY : CAMPAIGNS_COPY}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="reset-demo-data"
          className={BUTTON_CLASS}
          onClick={handleReset}
        >
          Reset demo data to empty
        </button>
        {seededPresent === false && (
          <button
            type="button"
            data-testid="restore-demo-data"
            className={BUTTON_CLASS}
            onClick={handleRestore}
          >
            Restore seeded demo data
          </button>
        )}
      </div>
      <p className="mt-2 text-black/60 dark:text-white/60">
        Reset clears projects and campaigns only. The Acquisitions page keeps its own “Reset
        acquisition demo data” control, and the Campaigns page keeps “Reset simulation”.
      </p>
    </section>
  );
}
