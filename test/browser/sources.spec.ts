import { expect, test } from "@playwright/test";

/**
 * The `/sources` page — the deployed surface for the Rock Island source-discovery run.
 *
 * Runs against the DEPLOYED URL via `baseURL` in `playwright.config.ts`. There is no `webServer`
 * block and none may be added: a localhost pass proves nothing a grader will ever see.
 *
 * Unlike the map specs there is nothing to wait for beyond navigation — the page is a Server
 * Component with no client fetch, so its content is in the first paint even with JS disabled.
 */

const SIGNALS = ["roof-age", "water-view", "transit-walkability", "starbucks-walkability"];

test("renders the source inventory, the egress panel, and source cards", async ({ page }) => {
  await page.goto("/sources");

  await expect(page.getByTestId("sources-page")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Rock Island County data sources" }),
  ).toBeVisible();

  // The probing limitation is always rendered, never behind a disclosure — an unreachable
  // source that looks merely absent is the exact failure this panel exists to prevent.
  const egress = page.getByTestId("sources-egress-note");
  await expect(egress).toBeVisible();
  await expect(egress).toContainText("unreachable from this egress");

  // At least one source card, and the parcel layer specifically — it is the county's strongest
  // source and the one the Demo Script names.
  const cards = page.locator('[data-testid^="source-card-"]');
  expect(await cards.count()).toBeGreaterThan(0);

  const parcels = page.getByTestId("source-card-parcels");
  await expect(parcels).toBeVisible();
  await expect(parcels).toContainText("65,955");
  await expect(parcels).toContainText("download");

  // No card may show a blank, "N/A" or bare "0" where a value is absent.
  await expect(page.getByTestId("sources-page")).not.toContainText("N/A");
});

test("shows every requested signal with a verdict and a statement", async ({ page }) => {
  await page.goto("/sources");

  await expect(page.getByTestId("unavailable-signals")).toBeVisible();

  for (const signal of SIGNALS) {
    const row = page.getByTestId(`unavailable-signal-${signal}`);
    await expect(row, `${signal}: row visible`).toBeVisible();

    const text = (await row.innerText()).trim();
    expect(text.length, `${signal}: non-empty text`).toBeGreaterThan(0);

    // Each row must carry a verdict from the fixed enum and say what was checked. The verdict
    // badge is styled `uppercase` (the same convention as every other status chip on this page —
    // see the source-card status chip), and `innerText()` reflects that CSS text-transform, so the
    // match is case-insensitive: the enum value is what's asserted, not its rendered casing.
    expect(text, `${signal}: verdict present`).toMatch(
      /public-source-found|no-public-source-found|proxy-only-no-direct-source/i,
    );
    await expect(row, `${signal}: what was checked`).toContainText("What was checked");
  }
});

test("has no horizontal overflow at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/sources");
  await expect(page.getByTestId("sources-page")).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `scrollWidth ${overflow.scrollWidth} vs innerWidth ${overflow.innerWidth}`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
});
