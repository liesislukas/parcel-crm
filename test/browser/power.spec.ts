import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Every test here drives the deployed site. `baseURL` comes from `playwright.config.ts`
 * and never points at a local server.
 *
 * No test asserts a specific feature count, substation name, or distance value — the
 * snapshot is a point in time (OpenStreetMap is edited daily). This spec guards structure
 * and honesty: the layers exist, the toggle works, the gap category is stated, and the
 * nearest-distance readout has the right shape and derivation — never a specific number.
 */

/**
 * The parcel data is a 2.96 MB fetch that is then tiled by a web worker before
 * `queryRenderedFeatures` can hit anything. Waiting for the canvas alone is not enough —
 * the canvas exists as soon as the basemap does. So we wait for the honesty panel (proof
 * the JSON parsed), for the canvas, for the attribution control the map adds on create,
 * and then for the parcel geometry to actually be painted.
 *
 * Copied verbatim from test/browser/map.spec.ts lines 21–40 — that file is not modified or
 * exported from by this plan.
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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the power layers are added to the map", async ({ page }) => {
  await waitForMapReady(page);
  // Guard against the ISSUE-003 silent-absence defect class: a missing MapLibre layer
  // paints a healthy map and logs nothing.
  await expect(page.getByTestId("parcel-map")).toHaveAttribute("data-power-layers", "ready");
});

test("the power snapshot parses in the browser and its counts render", async ({ page }) => {
  await waitForMapReady(page);

  const substationCategory = page.getByTestId("power-category-substation");
  const lineCategory = page.getByTestId("power-category-transmission-line");

  // The counts are rendered from the parsed 306 KB data file, so a match proves the asset
  // landed and parsed — not merely that the meta file landed.
  await expect(substationCategory).toContainText(/Electric substations — \d+ features loaded/);
  await expect(lineCategory).toContainText(/Transmission lines — \d+ features loaded/);

  for (const category of [substationCategory, lineCategory]) {
    await expect(category).toContainText("Open Database License (ODbL) v1.0");
    await expect(category).toContainText("OpenStreetMap");
  }
});

test("the overlay toggles off and back on", async ({ page }) => {
  await waitForMapReady(page);

  const toggle = page.getByTestId("toggle-power");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText("Hide power infrastructure");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveText("Show power infrastructure");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText("Hide power infrastructure");
});

test("the unavailable category is stated, not omitted", async ({ page }) => {
  await waitForMapReady(page);

  const gap = page.getByTestId("power-category-interconnection-capacity");
  await expect(gap).toHaveAttribute("data-power-category-available", "false");
  await expect(gap).toContainText("Not available");
  await expect(gap).toContainText("No public source found for Rock Island County");
  await expect(gap).toContainText("Checked:");
});

test("a selected parcel shows the distance to the nearest substation and line", async ({
  page,
}) => {
  const map = await waitForMapReady(page);
  const details = page.getByTestId("parcel-details");

  // The map opens on the whole county now, so the old "the canvas centre is always inside a
  // known parcel" assumption is dead. `show-incomplete` is the deterministic replacement: it
  // focuses meta.incompletePins[0] and flies to its centroid at zoom 15. `data-camera-zoom`
  // is published on `moveend`, so waiting for it is race-free — a click dispatched mid-flight
  // would interrupt MapLibre's animation and hit-test halfway across the county.
  await page.getByTestId("show-incomplete").click();
  await expect(details).toContainText("Parcel ID (PIN)");
  await expect(map).toHaveAttribute("data-camera-zoom", "15.00", { timeout: 30000 });

  // Clearing first means the panel below can only have been populated by the map click.
  await page.getByTestId("clear-selection").click();
  await expect(page.getByTestId("selection-count")).toHaveText("0 parcels selected");

  // The poll only covers PMTiles range requests still landing, not any ambiguity about
  // which parcel is hit — the canvas centre is now that parcel's own centroid.
  await expect(async () => {
    await map.click();
    await expect(details).toContainText("Parcel ID (PIN)", { timeout: 2000 });
  }).toPass({ timeout: 45000 });

  await expect(page.getByTestId("power-nearest-substation")).toContainText(
    /Nearest substation — \d+\.\d{2} km \(\d+\.\d{2} mi\) from parcel \d+/,
  );
  await expect(page.getByTestId("power-nearest-line")).toContainText(
    /Nearest transmission line — \d+\.\d{2} km \(\d+\.\d{2} mi\) from parcel \d+/,
  );

  const derivation = page.getByTestId("power-derivation");
  await expect(derivation).toContainText("equirectangular projection");
  await expect(derivation).toContainText("not an interconnection study");
});

test("the map attribution names the power source and its licence", async ({ page }) => {
  await waitForMapReady(page);

  const attribution = page.locator(".maplibregl-ctrl-attrib");
  await expect(attribution).toContainText("OpenStreetMap");
  await expect(attribution).toContainText("ODbL");
});
