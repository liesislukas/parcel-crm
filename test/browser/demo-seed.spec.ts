import { expect, test } from "@playwright/test";

/**
 * Asserts every `Done when` line of ISSUE-014 against the deployed URL, in a browser context
 * that has never been seeded — Playwright's default fresh context, no `disableDemoSeed`. This
 * is the one spec in the suite that runs WITH the seed on; every other spec in
 * `test/browser/` opts out via `test/browser/demo-seed-off.ts`.
 *
 * No assertion here reads the simulated clock (`T+n ticks`), a campaign id, a message id or
 * an `effectiveAt` timestamp — per-message jitter makes those unstable by design. Runs
 * against `baseURL` from `playwright.config.ts` and nothing else; no local server.
 */

test("a fresh browser lands on two seeded projects", async ({ page }) => {
  await page.goto("/projects");

  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 2 of 2 projects");
  await expect(page.getByTestId("project-row")).toHaveCount(2);

  const columbia = page.locator(
    '[data-testid="project-row"][data-project-id="columbia-business-park"]',
  );
  await expect(columbia.getByTestId("project-row-acres")).toHaveText("45.97 ac");
  await expect(columbia.getByTestId("project-row-parcels")).toHaveText("3");
  await expect(columbia.getByTestId("project-row-blocks")).toHaveText("1 connected block");
  await expect(columbia.getByTestId("project-stage")).toHaveText("Negotiating");
  await expect(columbia.getByTestId("project-outreach")).toHaveText("Replied");
  await expect(columbia.getByTestId("project-seeded-badge")).toBeVisible();

  const rockIsland = page.locator(
    '[data-testid="project-row"][data-project-id="rock-island-0736101-assemblage"]',
  );
  await expect(rockIsland.getByTestId("project-row-acres")).toHaveText("15.98 ac");
  await expect(rockIsland.getByTestId("project-stage")).toHaveText("Not contacted");
  await expect(rockIsland.getByTestId("project-seeded-badge")).toBeVisible();
});

test("a fresh browser lands on three seeded campaigns with non-zero lifecycle counts", async ({
  page,
}) => {
  await page.goto("/campaigns");

  await expect(page.getByTestId("campaign-card")).toHaveCount(3);

  for (const channel of ["email", "sms", "direct_mail"] as const) {
    const card = page.locator(`[data-testid="campaign-card"][data-channel="${channel}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("simulated-badge")).toBeVisible();
    await expect(card.getByTestId("campaign-seeded-badge")).toBeVisible();
  }

  const emailCounts = page
    .locator('[data-testid="campaign-card"][data-channel="email"]')
    .getByTestId("campaign-counts");
  await expect(emailCounts).toHaveAttribute("data-count-messages", "7");
  await expect(emailCounts).toHaveAttribute("data-count-sent", "7");
  await expect(emailCounts).toHaveAttribute("data-count-delivered", "6");
  await expect(emailCounts).toHaveAttribute("data-count-clicked", "3");
  await expect(emailCounts).toHaveAttribute("data-count-replied", "2");
  await expect(emailCounts).toHaveAttribute("data-count-bounced", "1");

  const smsCounts = page
    .locator('[data-testid="campaign-card"][data-channel="sms"]')
    .getByTestId("campaign-counts");
  await expect(smsCounts).toHaveAttribute("data-count-replied", "3");
});

test("the outreach and stage filters each select between the seeded projects", async ({ page }) => {
  await page.goto("/projects");

  await page.getByTestId("filter-outreach-replied").click();
  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 1 of 2 projects");
  await expect(page.getByTestId("project-row")).toHaveAttribute(
    "data-project-id",
    "columbia-business-park",
  );

  await page.getByTestId("filter-outreach-replied").click();
  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 2 of 2 projects");

  await page.getByTestId("filter-stage-not-contacted").click();
  await expect(page.getByTestId("filter-result-count")).toHaveText("Showing 1 of 2 projects");
  await expect(page.getByTestId("project-row")).toHaveAttribute(
    "data-project-id",
    "rock-island-0736101-assemblage",
  );
});

test("the reset control empties both surfaces, and restore brings them back", async ({ page }) => {
  await page.goto("/projects");
  page.on("dialog", (dialog) => void dialog.accept());

  await page.getByTestId("reset-demo-data").click();
  await expect(page.getByTestId("projects-none-created")).toBeVisible();

  await page.goto("/campaigns");
  await expect(page.getByTestId("no-campaigns")).toBeVisible();

  await page.getByTestId("restore-demo-data").click();
  await expect(page.getByTestId("campaign-card")).toHaveCount(3);
});

test("both surfaces state the browser-only persistence boundary", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByTestId("demo-data-notice")).toContainText("appears in another browser");

  await page.goto("/campaigns");
  await expect(page.getByTestId("demo-data-notice")).toContainText("parcel-crm.campaigns.v1");
  await expect(page.getByTestId("demo-data-notice")).toContainText("Nothing was ever sent");
});
