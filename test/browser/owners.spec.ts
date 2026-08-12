import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Every test here drives the deployed site. `baseURL` comes from `playwright.config.ts`
 * and never points at a local server — see the comment there.
 *
 * Test 4 mutates persistent browser state (an enrichment event in `localStorage`), so its
 * cleanup step (clicking `reset-enrichments`) is mandatory, not optional — it is what keeps
 * this suite re-runnable.
 */

/**
 * Mirrors `test/browser/map.spec.ts`'s `waitForMapReady` (not imported — that file is out
 * of scope for this issue and not to be modified). The parcel data is a 2.96 MB fetch that
 * is then tiled by a web worker before a click can hit anything, so waiting for the canvas
 * alone is not enough.
 */
async function waitForMapReady(page: Page): Promise<Locator> {
  await expect(page.getByTestId("selection-summary")).toBeVisible();
  const map = page.getByTestId("parcel-map");
  await expect(map).toBeVisible();
  await expect(map.locator("canvas").first()).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="parcel-map"] canvas');
      if (!canvas) return false;
      const box = canvas.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    },
    undefined,
    { timeout: 30000 },
  );
  return map;
}

test("lists owner records derived from the parcel data", async ({ page }) => {
  await page.goto("/owners");

  const summary = page.getByTestId("owners-summary");
  await expect(summary).toContainText("4,573 owner CRM records");
  await expect(summary).toContainText("6,026 loaded parcels");

  const rows = page.getByTestId("owner-row");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText("AUGUSTANA COLLEGE");
});

test("shows county fields attributed and mocked contact badged", async ({ page }) => {
  await page.goto("/owners?owner=AUGUSTANA%20COLLEGE");

  await expect(page.getByTestId("owner-email")).toContainText("augustana.college@mock.invalid");
  await expect(page.getByTestId("owner-phone")).toContainText("(309) 555-0105");

  const contactBadges = page.getByTestId("owner-contact").getByTestId("mocked-badge");
  await expect(contactBadges).toHaveCount(2);

  await expect(page.getByTestId("owner-completeness")).toHaveAttribute(
    "data-completeness",
    "complete",
  );
});

test("states an incomplete owner honestly", async ({ page }) => {
  await page.goto("/owners?owner=CITY%20OF%20ROCK%20ISLAND");

  await expect(page.getByTestId("owner-completeness")).toHaveAttribute(
    "data-completeness",
    "incomplete",
  );
  await expect(page.getByTestId("owner-email")).toContainText("Not on file");
});

test("runs the mocked buy/enrich flow to completion and persists it", async ({ page }) => {
  await page.goto("/owners?owner=FIRST%20FINANCIAL%20GROUP%20LLC");

  await expect(page.getByTestId("owner-completeness")).toHaveAttribute(
    "data-completeness",
    "incomplete",
  );

  await page.getByTestId("enrich-start").click();
  await page.getByTestId("enrich-confirm").click();

  await expect(page.getByTestId("enrichment-history")).toBeVisible();
  await expect(page.getByTestId("owner-completeness")).toHaveAttribute(
    "data-completeness",
    "complete",
  );
  await expect(page.getByTestId("owner-email")).toContainText(
    "first.financial.group.llc@mock.invalid",
  );
  await expect(page.getByTestId("owner-phone")).toContainText("(309) 555-0126");

  await page.reload();
  await expect(page.getByTestId("owner-completeness")).toHaveAttribute(
    "data-completeness",
    "complete",
  );

  // Cleanup — mandatory, not optional, so the suite is re-runnable.
  await page.getByTestId("reset-enrichments").click();
  await expect(page.getByTestId("owner-completeness")).toHaveAttribute(
    "data-completeness",
    "incomplete",
  );
});

test("reaches the owner record from a parcel on the map", async ({ page }) => {
  await page.goto("/");
  const map = await waitForMapReady(page);
  const details = page.getByTestId("parcel-details");

  // Same deterministic centre-click-with-retry pattern as `map.spec.ts` — `fitBounds` puts
  // the bbox centre at the canvas centre, which always lands inside a real parcel, but the
  // web worker tiling the GeoJSON can still be mid-flight on the first click.
  await expect(async () => {
    await map.click();
    await expect(details).toContainText("Parcel ID (PIN)", { timeout: 2000 });
  }).toPass({ timeout: 45000 });

  const ownerRowText = (await details.locator('[data-field="owner"] dd').innerText()).trim();

  await page.getByTestId("open-owner-record").click();

  const record = page.getByTestId("owner-record");
  await expect(record).toBeVisible();
  await expect(record.locator("h2")).toHaveText(ownerRowText);
});
