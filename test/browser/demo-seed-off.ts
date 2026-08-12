import type { Page } from "@playwright/test";

/**
 * Blocks the first-load demo seed by pre-writing a `cleared` manifest before any script on
 * the page runs. Touches only `src/lib/demo/manifest.ts`'s key
 * (`parcel-crm.demo-seed.v1`) — no project, campaign or acquisition store — so a spec that
 * seeds its own fixtures (like `project-filters.spec.ts`'s `seedProjects`) is unaffected.
 */
export async function disableDemoSeed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "parcel-crm.demo-seed.v1",
      JSON.stringify({
        version: 1,
        state: "cleared",
        at: "2026-01-01T00:00:00.000Z",
        projectIds: [],
        campaignIds: [],
      }),
    );
  });
}
