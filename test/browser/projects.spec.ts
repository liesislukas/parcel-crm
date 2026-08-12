import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Every test here drives the deployed site. `baseURL` comes from `playwright.config.ts`
 * and never points at a local server.
 *
 * The `waitForMapReady` and `drawRectangle` helpers are copied from `test/browser/map.spec.ts`
 * on purpose — duplicated so the two specs stay independently readable, rather than sharing a
 * helper module.
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

async function drawRectangle(
  page: Page,
  map: Locator,
  from: { dx: number; dy: number },
  to: { dx: number; dy: number },
): Promise<void> {
  // The map opens on the whole county now. A rectangle drawn at that zoom would cover most
  // of Rock Island County and be refused by the 2,000-parcel draw limit, so every drawing
  // test first flies to a known parcel at zoom 15 via `show-incomplete`. The draw that
  // follows replaces the selection outright, so the flown-to parcel does not contaminate it.
  await page.getByTestId("show-incomplete").click();
  await expect(page.getByTestId("parcel-details")).toContainText("Parcel ID (PIN)");
  // `data-camera-zoom` is published on `moveend`: waiting for it is what keeps the drag
  // below from starting while the camera is still flying across the county.
  await expect(map).toHaveAttribute("data-camera-zoom", "15.00", { timeout: 30000 });

  await page.getByTestId("draw-area").click();
  await expect(page.getByTestId("draw-area")).toHaveAttribute("aria-pressed", "true");

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

  await expect(page.getByTestId("draw-area")).toHaveAttribute("aria-pressed", "false");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.removeItem("parcel-crm.projects.v1"));
  await page.reload();
});

test("a contiguous project is created from a drawn area", async ({ page }) => {
  const map = await waitForMapReady(page);
  const name = `E2E ${Date.now()}`;

  await drawRectangle(page, map, { dx: -60, dy: -60 }, { dx: 60, dy: 60 });

  const keepLargest = page.getByTestId("keep-largest-block");
  if (await keepLargest.isVisible()) {
    await keepLargest.click();
  }

  await expect(page.getByTestId("selection-blocks")).toHaveText("1 connected block");

  await page.getByTestId("project-name").fill(name);
  await page.getByTestId("create-project").click();

  await expect(page.getByTestId("create-project-result")).toContainText("Created");
  await expect(page.getByTestId("create-project-result")).toContainText("1 connected block");
});

test("the project appears on /projects with the same acreage", async ({ page }) => {
  const map = await waitForMapReady(page);
  const name = `E2E ${Date.now()}`;

  await drawRectangle(page, map, { dx: -60, dy: -60 }, { dx: 60, dy: 60 });
  const keepLargest = page.getByTestId("keep-largest-block");
  if (await keepLargest.isVisible()) {
    await keepLargest.click();
  }
  await expect(page.getByTestId("selection-blocks")).toHaveText("1 connected block");

  await page.getByTestId("project-name").fill(name);
  await page.getByTestId("create-project").click();
  await expect(page.getByTestId("create-project-result")).toContainText("Created");

  const mapAcres = (await page.getByTestId("selection-acres").innerText()).trim();

  await page.goto("/projects");
  const row = page.getByTestId("project-row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("project-row-acres")).toHaveText(mapAcres);
});

test("combined acreage equals the sum of the member rows", async ({ page }) => {
  const map = await waitForMapReady(page);
  const name = `E2E ${Date.now()}`;

  await drawRectangle(page, map, { dx: -60, dy: -60 }, { dx: 60, dy: 60 });
  const keepLargest = page.getByTestId("keep-largest-block");
  if (await keepLargest.isVisible()) {
    await keepLargest.click();
  }
  await expect(page.getByTestId("selection-blocks")).toHaveText("1 connected block");

  await page.getByTestId("project-name").fill(name);
  await page.getByTestId("create-project").click();
  await expect(page.getByTestId("create-project-result")).toContainText("Created");

  await page.getByTestId("go-to-projects").click();
  const row = page.getByTestId("project-row").filter({ hasText: name });
  await row.getByTestId("project-row-name").click();

  await expect(page.getByTestId("project-detail")).toBeVisible();
  const memberAcres = await page.getByTestId("detail-member-acres").allInnerTexts();
  const memberCount = memberAcres.length;
  const sum = memberAcres.reduce((total, text) => {
    const match = /^(\d+(?:\.\d+)?)/.exec(text.trim());
    expect(match, `detail-member-acres read "${text}"`).not.toBeNull();
    return total + Number(match![1]);
  }, 0);

  const detailText = (await page.getByTestId("detail-acres").innerText()).trim();
  const detailMatch = /^(\d+(?:\.\d+)?)/.exec(detailText);
  expect(detailMatch, `detail-acres read "${detailText}"`).not.toBeNull();
  const detailAcres = Number(detailMatch![1]);

  // The tolerance is the per-row 2-dp display rounding and nothing else.
  expect(Math.abs(sum - detailAcres)).toBeLessThanOrEqual(0.01 * memberCount);
});

test("a project survives a reload", async ({ page }) => {
  const map = await waitForMapReady(page);
  const name = `E2E ${Date.now()}`;

  await drawRectangle(page, map, { dx: -60, dy: -60 }, { dx: 60, dy: 60 });
  const keepLargest = page.getByTestId("keep-largest-block");
  if (await keepLargest.isVisible()) {
    await keepLargest.click();
  }
  await page.getByTestId("project-name").fill(name);
  await page.getByTestId("create-project").click();
  await expect(page.getByTestId("create-project-result")).toContainText("Created");

  await page.reload();

  await page.goto("/projects");
  const rows = page.getByTestId("project-row").filter({ hasText: name });
  await expect(rows).toHaveCount(1);
});

test("reopening re-highlights the parcels, and adding one recalculates", async ({ page }) => {
  const map = await waitForMapReady(page);
  const name = `E2E ${Date.now()}`;

  await drawRectangle(page, map, { dx: -60, dy: -60 }, { dx: 60, dy: 60 });
  const keepLargest = page.getByTestId("keep-largest-block");
  if (await keepLargest.isVisible()) {
    await keepLargest.click();
  }
  const createdCountText = (await page.getByTestId("selection-parcels").innerText()).trim();
  const createdCount = Number(/^(\d+)/.exec(createdCountText)![1]);

  await page.getByTestId("project-name").fill(name);
  await page.getByTestId("create-project").click();
  await expect(page.getByTestId("create-project-result")).toContainText("Created");

  await page.goto("/projects");
  const row = page.getByTestId("project-row").filter({ hasText: name });
  await row.getByTestId("project-open-map").click();

  const reopenedMap = await waitForMapReady(page);
  await expect(page.getByTestId("project-mode")).toBeVisible();
  await expect(page.getByTestId("selection-parcels")).toHaveText(
    `${createdCount} parcel${createdCount === 1 ? "" : "s"}`,
  );

  // WI-9's `fitTo` deliberately frames the reopened project tightly around its own
  // members, so the map's centre point sits inside the block that is already selected.
  // A plain centre click therefore lands on an already-selected parcel, and the click
  // handler is intentionally idempotent for repeat clicks on the same parcel (see
  // `MapWorkspace.handleParcelClick`), so the count would never move — confirmed against
  // the deployed runtime, where a centre click reproducibly leaves the count unchanged.
  // Offsetting the click clear of the tightly-fitted centre reaches a neighbouring,
  // not-yet-selected parcel instead. The `fitTo` jump also uses `animate: false`, so the
  // freshly-panned tile can still be settling the instant the map becomes visible —
  // MapLibre's hit-test silently finds nothing if the click lands before that tile has
  // rendered. Retrying the offset click absorbs that render-settle race without
  // depending on a fixed sleep.
  await reopenedMap.scrollIntoViewIfNeeded();
  const reopenedBox = await reopenedMap.boundingBox();
  expect(reopenedBox).not.toBeNull();
  // A single fixed offset is not enough at county scale: the project is now assembled from
  // whatever the zoom-15 drag caught, so one particular offset can land on a parcel that is
  // already a member (the click handler is idempotent by design) or on a street gap, where
  // the count correctly never moves. Cycling outward offsets finds a neighbouring
  // not-yet-selected parcel; the assertion itself is unchanged and still exact — the count
  // must go up by exactly one.
  const addOffsets = [
    [150, 0],
    [-150, 0],
    [0, 120],
    [0, -120],
    [220, 100],
    [-220, -100],
    [110, -160],
    [-110, 160],
  ] as const;
  let addAttempt = 0;
  await expect(async () => {
    const [dx, dy] = addOffsets[addAttempt % addOffsets.length];
    addAttempt += 1;
    await page.mouse.click(
      reopenedBox!.x + reopenedBox!.width / 2 + dx,
      reopenedBox!.y + reopenedBox!.height / 2 + dy,
    );
    await expect(page.getByTestId("selection-parcels")).toHaveText(
      `${createdCount + 1} parcel${createdCount + 1 === 1 ? "" : "s"}`,
      { timeout: 1000 },
    );
  }).toPass({ timeout: 30000 });

  await page.getByTestId("save-project-selection").click();
  await expect(page.getByTestId("create-project-result")).toContainText("Saved");

  await page.goto("/projects");
  const updatedRow = page.getByTestId("project-row").filter({ hasText: name });
  await expect(updatedRow.getByTestId("project-row-parcels")).toHaveText(String(createdCount + 1));
});
