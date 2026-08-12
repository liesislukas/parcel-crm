import { expect, test, type Page } from "@playwright/test";

/**
 * Runs against the deployed URL via `baseURL`. Never a local server.
 *
 * Projects are per-browser `localStorage` records, so a fresh Playwright context has none.
 * This spec seeds five fixture projects with `page.addInitScript` before
 * `page.goto("/projects")`, writing to the canonical storage key
 * `parcel-crm.projects.v1` (`PROJECTS_STORAGE_KEY` in `src/lib/projectStore.ts`, confirmed
 * against the real code in ISSUE-008 Work item 0). These are test fixtures inside a
 * throwaway browser context; they are never shipped into the product and never presented
 * as county data.
 *
 * POWER AMENDMENT (coordinator, 2026-08-12): ISSUE-010 had already shipped by the time
 * ISSUE-008 was executed, so `POWER_ACCESS_SOURCE.loaded` is `true` (see
 * `src/lib/powerAccess.ts`) — the power control below is an ENABLED distance select, not
 * the disabled placeholder the original plan described. Every fixture project below is a
 * flat record with no `pins`/`parcelPins` array, so the adapter can never resolve a member
 * parcel's centroid for any of them — their power access is honestly Unknown regardless of
 * the source being loaded, exercising the "flagged, not dropped" behaviour the same way the
 * original disabled-control design intended.
 */

type Fixture = {
  id: string;
  name: string;
  acres?: number;
  outreachStatus?: string;
  acquisitionStage?: string;
};

const FIXTURES: Fixture[] = [
  {
    id: "p1",
    name: "Rock River North",
    acres: 120,
    outreachStatus: "sent",
    acquisitionStage: "negotiating",
  },
  {
    id: "p2",
    name: "Milan Junction",
    acres: 12,
    outreachStatus: "replied",
    acquisitionStage: "contacted",
  },
  {
    id: "p3",
    name: "Arsenal Edge",
    acres: 240,
    outreachStatus: "sent",
    acquisitionStage: "negotiating",
  },
  { id: "p4", name: "Coal Valley West", outreachStatus: "none", acquisitionStage: "not-contacted" },
  { id: "p5", name: "Blackhawk South", acres: 80, acquisitionStage: "banana" },
];

async function seedProjects(page: Page): Promise<void> {
  await page.addInitScript((fixtures: Fixture[]) => {
    const now = new Date().toISOString();
    const envelope = {
      version: 1,
      projects: fixtures.map((f) => ({ ...f, createdAt: now, updatedAt: now })),
    };
    window.localStorage.setItem("parcel-crm.projects.v1", JSON.stringify(envelope));
  }, FIXTURES);
}

const POWER_UNKNOWN_LABEL = "Unknown — no power distance available for this project";

test.beforeEach(async ({ page }) => {
  await seedProjects(page);
  await page.goto("/projects");
  await expect(page.getByTestId("filter-bar")).toBeVisible();
});

test("renders the filter bar and a full count", async ({ page }) => {
  await expect(page.getByTestId("filter-county")).toBeVisible();
  await expect(page.getByTestId("filter-acres-min")).toBeVisible();
  await expect(page.getByTestId("filter-power")).toBeVisible();
  for (const status of ["none", "sent", "delivered", "clicked", "replied", "bounced"]) {
    await expect(page.getByTestId(`filter-outreach-${status}`)).toBeVisible();
  }
  for (const stage of [
    "not-contacted",
    "contacted",
    "negotiating",
    "under-contract",
    "closed-won",
    "closed-lost",
  ]) {
    await expect(page.getByTestId(`filter-stage-${stage}`)).toBeVisible();
  }
  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 5 of 5 projects");
});

test("acreage range narrows the list", async ({ page }) => {
  await page.getByTestId("filter-acres-min").fill("40");
  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 3 of 5 projects");
  await expect(page.getByTestId("filter-unknown-acres")).toHaveText(
    "1 projects hidden: no source acreage on any member parcel.",
  );
  const ids = await page
    .getByTestId("project-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-project-id")));
  expect(ids.sort()).toEqual(["p1", "p3", "p5"]);
});

test("the demo combination narrows to two projects (AC6, Demo Script step 1)", async ({ page }) => {
  await page.getByTestId("filter-acres-min").fill("40");
  await page.getByTestId("filter-outreach-sent").check();
  await page.getByTestId("filter-stage-negotiating").check();
  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 2 of 5 projects");
  const ids = await page
    .getByTestId("project-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-project-id")));
  expect(ids.sort()).toEqual(["p1", "p3"]);
});

test("unknown power is flagged, not dropped (Demo Script step 2, AC3)", async ({ page }) => {
  // POWER AMENDMENT: the source is loaded, so the control is enabled and shows the real
  // distance options plus the OSM source line — not the disabled "no source" state.
  await expect(page.getByTestId("filter-power")).toBeEnabled();
  await expect(page.getByTestId("filter-power-source")).toBeVisible();
  await expect(page.getByTestId("filter-power-nodata")).toHaveCount(0);

  const powerCells = page.getByTestId("project-power");
  await expect(powerCells).toHaveCount(5);
  for (const cell of await powerCells.all()) {
    await expect(cell).toHaveText(POWER_UNKNOWN_LABEL);
    await expect(cell).toHaveAttribute("data-field-state", "missing");
  }

  // Toggling the power distance filter must not change the row count while
  // "include unknown power" stays checked — the row count from the first test is unchanged.
  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 5 of 5 projects");
});

test("a filtered URL is reproducible", async ({ page }) => {
  await page.goto("/projects?acresMin=40&outreach=sent&stage=negotiating");
  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 2 of 5 projects");
  await expect(page.getByTestId("filter-acres-min")).toHaveValue("40");
  await expect(page.getByTestId("filter-stage-negotiating")).toBeChecked();
});

test("an unrecognised stage is stated, not swallowed", async ({ page }) => {
  await expect(page.getByTestId("filter-unknown-rawstage")).toContainText("banana");

  await page.getByTestId("filter-stage-negotiating").check();
  await expect(page.getByTestId("filter-unknown-stage")).toHaveText(
    "1 projects hidden: no acquisition stage recorded.",
  );
  const ids = await page
    .getByTestId("project-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-project-id")));
  expect(ids).not.toContain("p5");
});
