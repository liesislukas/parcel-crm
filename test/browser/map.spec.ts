import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Every test here drives the deployed site. `baseURL` comes from `playwright.config.ts`
 * and never points at a local server.
 */

/** The bbox centre lands on this parcel after `fitBounds`. Verified against the data. */
const CENTRE_PIN = "0736343005";

/** `meta.incompletePins[0]` — the parcel `show-incomplete` flies to. */
const INCOMPLETE_PIN = "0725200001";

/**
 * The parcel data is a 2.96 MB fetch that is then tiled by a web worker before
 * `queryRenderedFeatures` can hit anything. Waiting for the canvas alone is not enough —
 * the canvas exists as soon as the basemap does. So we wait for the honesty panel (proof
 * the JSON parsed), for the canvas, for the attribution control the map adds on create,
 * and then for the parcel geometry to actually be painted.
 */
async function waitForMapReady(page: Page): Promise<Locator> {
  await expect(page.getByTestId("selection-summary")).toBeVisible();
  const map = page.getByTestId("parcel-map");
  await expect(map).toBeVisible();
  await expect(map.locator("canvas").first()).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
  // MapLibre keeps `map.loaded()` false while GeoJSON tiles are still being built, and it
  // is the only honest signal that a click can hit `parcels-fill`.
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

/** Reads the integer out of "N parcels selected". */
async function selectionCount(page: Page): Promise<number> {
  const text = (await page.getByTestId("selection-count").innerText()).trim();
  const match = /^(\d+) parcels? selected$/.exec(text);
  expect(match, `selection-count read "${text}"`).not.toBeNull();
  return Number(match![1]);
}

/**
 * Drags a rectangle on the map canvas, in map-container coordinates relative to its
 * centre. MapLibre only tracks a drag if it sees intermediate `mousemove` events, hence
 * `steps`.
 */
async function drawRectangle(
  page: Page,
  map: Locator,
  from: { dx: number; dy: number },
  to: { dx: number; dy: number },
): Promise<void> {
  await page.getByTestId("draw-area").click();
  await expect(page.getByTestId("draw-area")).toHaveAttribute("aria-pressed", "true");

  // The map is 70vh tall and sits below the heading, so at a 720 px-tall window its lower
  // half is off the fold. `page.mouse` coordinates are viewport coordinates and a point
  // below the fold never reaches the canvas — scroll the map fully into view first, then
  // measure.
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  const viewport = page.viewportSize()!;
  for (const [x, y] of [
    [cx + from.dx, cy + from.dy],
    [cx + to.dx, cy + to.dy],
  ]) {
    expect(x, "drag x is inside the viewport").toBeGreaterThan(0);
    expect(x, "drag x is inside the viewport").toBeLessThan(viewport.width);
    expect(y, "drag y is inside the viewport").toBeGreaterThan(0);
    expect(y, "drag y is inside the viewport").toBeLessThan(viewport.height);
  }

  await page.mouse.move(cx + from.dx, cy + from.dy);
  await page.mouse.down();
  await page.mouse.move(cx + to.dx, cy + to.dy, { steps: 12 });
  await page.mouse.up();

  // Draw mode is switched off by `handleRectDrawn`, so this flipping back to "false" is
  // the signal that the rectangle was applied to the selection — without it, reading the
  // count can race the state update and read the previous value.
  await expect(page.getByTestId("draw-area")).toHaveAttribute("aria-pressed", "false");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("map and scope banner render on the deployed site", async ({ page }) => {
  const map = await waitForMapReady(page);

  await expect(map).toBeVisible();
  await expect(page.getByTestId("selection-summary")).toContainText(
    "of 65,955 Rock Island County parcels loaded",
  );
  expect(await map.locator("canvas").count()).toBeGreaterThanOrEqual(1);
});

test("the disabled future-scope grid still renders", async ({ page }) => {
  // Regression guard for README line 29 — the future sections stay on the page, disabled.
  const future = page.locator('[data-testid^="future-"]');
  await expect(future.first()).toBeVisible();
  expect(await future.count()).toBeGreaterThanOrEqual(8);

  const total = await future.count();
  for (let i = 0; i < total; i += 1) {
    await expect(future.nth(i)).toBeVisible();
  }
});

test("clicking a parcel opens the details panel", async ({ page }) => {
  const map = await waitForMapReady(page);
  const details = page.getByTestId("parcel-details");

  // The click is deterministic: `fitBounds` puts the bbox centre (-90.56, 41.505) at the
  // canvas centre, and that coordinate falls inside PIN 0736343005. The poll only covers
  // the worker still tiling the GeoJSON, not any ambiguity about which parcel is hit.
  await expect(async () => {
    await map.click();
    await expect(details).toContainText("Parcel ID (PIN)", { timeout: 2000 });
  }).toPass({ timeout: 45000 });

  await expect(details.locator('[data-field="pin"] dd')).toHaveText(CENTRE_PIN);
  await expect(page.getByTestId("selection-count")).toHaveText("1 parcel selected");
});

test("drawing a rectangle selects multiple parcels", async ({ page }) => {
  const map = await waitForMapReady(page);

  await drawRectangle(page, map, { dx: -90, dy: -90 }, { dx: 90, dy: 90 });

  await expect(page.getByTestId("selection-count")).toHaveText(/^\d+ parcels selected$/);
  expect(await selectionCount(page)).toBeGreaterThan(1);
});

test("clearing and redrawing replaces the previous selection", async ({ page }) => {
  const map = await waitForMapReady(page);

  await drawRectangle(page, map, { dx: -90, dy: -90 }, { dx: 90, dy: 90 });
  await expect(page.getByTestId("selection-count")).toHaveText(/^\d+ parcels selected$/);
  const first = await selectionCount(page);
  expect(first).toBeGreaterThan(1);

  await page.getByTestId("clear-selection").click();
  await expect(page.getByTestId("selection-count")).toHaveText("0 parcels selected");

  // A different rectangle, offset from the first one.
  await drawRectangle(page, map, { dx: 20, dy: 20 }, { dx: 140, dy: 140 });
  await expect(page.getByTestId("selection-count")).toHaveText(/^\d+ parcels? selected$/);
  expect(await selectionCount(page)).toBeGreaterThan(0);
});

test("the incomplete-data parcel renders unavailable fields", async ({ page }) => {
  await waitForMapReady(page);

  await page.getByTestId("show-incomplete").click();

  const details = page.getByTestId("parcel-details");
  await expect(details).toContainText("Not available");
  await expect(details.locator('[data-field-state="missing"]').first()).toBeVisible();

  // The deterministic anchor: meta.incompletePins[0] is the Rock Island Arsenal parcel.
  await expect(details.locator('[data-field="pin"] dd')).toHaveText(INCOMPLETE_PIN);
  await expect(details.locator('[data-field="owner"] dd')).toContainText("ROCK ISLAND ARSENAL");
  await expect(details.locator('[data-field="assessedValue"] dd')).toContainText("$0");
  await expect(details.locator('[data-field="assessedValue"] dd')).toContainText(
    "commonly a tax-exempt parcel",
  );
  await expect(details.locator('[data-field="acres"] dd')).toHaveText("975.69 ac");

  // Both mailing-address lines are absent in the source, and both say so explicitly.
  const mailing = details.locator('[data-field="mailingStreet"] dd');
  await expect(mailing).toHaveCount(2);
  await expect(mailing.nth(0)).toHaveAttribute("data-field-state", "missing");
  await expect(mailing.nth(0)).toHaveText("Not available");
  const csz = details.locator('[data-field="mailingCityStateZip"]');
  await expect(csz).toHaveAttribute("data-field-state", "missing");
  await expect(csz).toHaveText("Not available");
});
