import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Every test here drives the deployed site. `baseURL` comes from `playwright.config.ts`
 * and never points at a local server.
 */

/**
 * `meta.incompletePins[0]` — the parcel `show-incomplete` flies to, at zoom 15.
 *
 * The map now opens on the whole county, so the old assumption that the canvas centre sits
 * on one known parcel is dead: at county zoom the centre is an arbitrary point in a
 * 65,953-parcel layer. `show-incomplete` is the deterministic replacement — it focuses
 * `incompletePins[0]` and flies to its precomputed centroid, so after it every test knows
 * exactly which parcel is under the middle of the canvas.
 */
const INCOMPLETE_PIN = "0331120001";

/**
 * The parcel attributes sidecar is a 10.7 MB fetch, and the geometry arrives separately as
 * PMTiles range requests. Waiting for the canvas alone is not enough — the canvas exists as
 * soon as the basemap does. So we wait for the honesty panel (proof the sidecar parsed), for
 * the canvas, for the attribution control the map adds on create, and then for the parcel
 * geometry to actually be painted.
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

/**
 * Flies to `incompletePins[0]` at zoom 15 and waits for the details panel to prove it
 * landed. Every click or drag test starts here: at county zoom a drag would cover most of
 * Rock Island County and trip the 2,000-parcel draw limit, and a click would be a lottery.
 */
async function flyToKnownParcel(page: Page): Promise<void> {
  await page.getByTestId("show-incomplete").click();
  await expect(page.getByTestId("parcel-details").locator('[data-field="pin"] dd')).toHaveText(
    INCOMPLETE_PIN,
  );
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

  // Deterministic path: fly to a known parcel at zoom 15 first, clear the panel, then click
  // the canvas centre — which is that parcel's centroid. The poll only covers PMTiles range
  // requests still landing, not any ambiguity about which parcel is hit.
  await flyToKnownParcel(page);
  await page.getByTestId("clear-selection").click();
  await expect(page.getByTestId("selection-count")).toHaveText("0 parcels selected");

  await expect(async () => {
    await map.click();
    await expect(details).toContainText("Parcel ID (PIN)", { timeout: 2000 });
  }).toPass({ timeout: 45000 });

  await expect(details.locator('[data-field="pin"] dd')).toHaveText(INCOMPLETE_PIN);
  await expect(page.getByTestId("selection-count")).toHaveText("1 parcel selected");
});

test("parcels still render when the basemap tile server stalls", async ({ page }) => {
  // Regression guard for 64c3a8e. The parcel source and layers used to be added inside
  // `map.on("load")`, and MapLibre only fires `load` once every in-view tile of every
  // source has SETTLED. One OpenStreetMap tile left hanging is enough to hold that event
  // back forever, so `addSource`/`addLayer` never ran: the cached basemap still painted,
  // nothing was logged, and the parcels were silently absent.
  //
  // The stall is the whole point. An aborted or errored tile reaches state "errored",
  // which counts as settled, `load` fires as usual, and the defect does NOT reproduce —
  // so this handler must never fulfil, abort or continue the request.
  let stalledTiles = 0;
  await page.route("**/tile.openstreetmap.org/**", () => {
    stalledTiles += 1;
  });

  // The route is registered after `beforeEach` has already navigated, so reload with the
  // basemap now permanently hanging. `domcontentloaded` rather than the default `load`:
  // the tile requests stay pending for the lifetime of the page.
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const map = await waitForMapReady(page);
  const details = page.getByTestId("parcel-details");

  // Guards against the test quietly becoming vacuous: if nothing was intercepted, the
  // basemap was healthy and the rest of this spec proves nothing.
  await expect
    .poll(() => stalledTiles, { message: "no basemap tile request was intercepted" })
    .toBeGreaterThan(0);

  // Same deterministic centre click as the healthy-basemap spec above, and the clear in the
  // middle matters: it empties the details panel, so what populates it afterwards can only
  // be the map click. A DOM-level result is the honest proof that the parcel layers exist —
  // `parcels-fill` has to be present and painted for MapLibre to hit-test the click.
  await flyToKnownParcel(page);
  await page.getByTestId("clear-selection").click();
  await expect(page.getByTestId("selection-count")).toHaveText("0 parcels selected");

  await expect(async () => {
    await map.click();
    await expect(details).toContainText("Parcel ID (PIN)", { timeout: 2000 });
  }).toPass({ timeout: 45000 });

  await expect(details.locator('[data-field="pin"] dd')).toHaveText(INCOMPLETE_PIN);
  await expect(page.getByTestId("selection-count")).toHaveText("1 parcel selected");
});

test("drawing a rectangle selects multiple parcels", async ({ page }) => {
  const map = await waitForMapReady(page);

  // Zoom 15 first: a drag at county zoom would cover thousands of parcels and be refused.
  await flyToKnownParcel(page);
  await drawRectangle(page, map, { dx: -90, dy: -90 }, { dx: 90, dy: 90 });

  await expect(page.getByTestId("selection-count")).toHaveText(/^\d+ parcels selected$/);
  expect(await selectionCount(page)).toBeGreaterThan(1);
});

test("clearing and redrawing replaces the previous selection", async ({ page }) => {
  const map = await waitForMapReady(page);

  // Zoom 15 first: a drag at county zoom would cover thousands of parcels and be refused.
  await flyToKnownParcel(page);
  await drawRectangle(page, map, { dx: -90, dy: -90 }, { dx: 90, dy: 90 });
  await expect(page.getByTestId("selection-count")).toHaveText(/^\d+ parcels selected$/);
  const first = await selectionCount(page);
  expect(first).toBeGreaterThan(1);

  // Clearing 2+ parcels now asks for confirmation — see ISSUE-004 WI-5.
  page.once("dialog", (dialog) => dialog.accept());
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

  // The deterministic anchor: county-wide, meta.incompletePins[0] is PIN 0331120001, which
  // the county publishes with an outline and an acreage but no owner, value or mailing
  // fields at all. Every absent field says so rather than showing a zero.
  await expect(details.locator('[data-field="pin"] dd')).toHaveText(INCOMPLETE_PIN);
  await expect(details.locator('[data-field="owner"] dd')).toHaveText("Not available");
  await expect(details.locator('[data-field="owner"] dd')).toHaveAttribute(
    "data-field-state",
    "missing",
  );
  await expect(details.locator('[data-field="assessedValue"] dd')).toHaveText("Not available");
  await expect(details.locator('[data-field="acres"] dd')).toHaveText("1.20 ac");

  // Both mailing-address lines are absent in the source, and both say so explicitly.
  const mailing = details.locator('[data-field="mailingStreet"] dd');
  await expect(mailing).toHaveCount(2);
  await expect(mailing.nth(0)).toHaveAttribute("data-field-state", "missing");
  await expect(mailing.nth(0)).toHaveText("Not available");
  const csz = details.locator('[data-field="mailingCityStateZip"]');
  await expect(csz).toHaveAttribute("data-field-state", "missing");
  await expect(csz).toHaveText("Not available");
});
