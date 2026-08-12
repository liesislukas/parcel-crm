"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureDemoSeed, resetDemoData, restoreDemoData } from "@/lib/demo/ensureSeed";
import { loadProjects } from "@/lib/projectStore";
import { SEEDED_PROJECT_ID } from "@/lib/demo/seedData";

const RESET_CONFIRM =
  'Clear the seeded demo projects and every simulated campaign in this browser, leaving both pages empty? Acquisition records and tasks are not affected — use "Reset acquisition demo data" on the Acquisitions page for those. This cannot be undone.';

const BUTTON_CLASS = "rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25";

const PROJECTS_COPY =
  "Two example projects are seeded into this browser the first time you open the app, so the filters and the export have something real to work on. Both are badged SEEDED, both are assembled from real Rock Island County GIS parcels with their real combined acreage, and neither was created by you. Projects you create yourself are never overwritten and never badged. Projects are saved in this browser only — this deployment has no server database, so nothing here appears in another browser, another device, or a private window.";

const CAMPAIGNS_COPY =
  "The campaigns badged SEEDED were generated in this browser the first time you opened the app and run to completion by the in-app simulator, so the lifecycle counts are populated before you do anything. Nothing was ever sent. Campaigns you create yourself are never overwritten and never badged. Campaigns are stored in this browser only, under the localStorage key parcel-crm.campaigns.v1 — this deployment has no server database, so nothing here appears in another browser, another device, or a private window.";

export function DemoDataNotice({ surface }: { surface: "projects" | "campaigns" }) {
  // Presence check, hydration-safe: starts `null` (renders no restore button, matching
  // server output), then resolves once the client confirms the seed pass — including
  // waiting for it to finish, per the note above — has actually run.
  //
  // Deviation from the plan: awaiting `ensureDemoSeed()` here (idempotent; see its own doc
  // comment) before the read is required, not just belt-and-braces — `runToCompletion`'s
  // campaign-store commit can force a re-render of a sibling component (e.g.
  // `CampaignsWorkspace`) before `ensureDemoSeed` reaches its final `writeManifest` call, and
  // a one-shot `useEffect` read with no wait can observe stale state with no further
  // notification to correct it. Awaiting first, then reading, removes the race entirely —
  // the same "await, then read" idiom `ProjectsExplorer.tsx`'s own load effect uses. This
  // still does not trip `react-hooks/set-state-in-effect`: the `setState` call happens after
  // an `await`, inside an async function invoked from the effect, not synchronously at the
  // effect's top level.
  const [seededPresent, setSeededPresent] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      await ensureDemoSeed();
      if (cancelled) return;
      setSeededPresent(loadProjects().some((p) => p.id === SEEDED_PROJECT_ID));
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

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
