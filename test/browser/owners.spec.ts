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
  await expect(summary).toContainText("50,040 owner CRM records");
  await expect(summary).toContainText("65,955 loaded parcels");

  const rows = page.getByTestId("owner-row");
  await expect(rows.first()).toBeVisible();
  // buildOwnerRecords sorts by parcelCount descending, then name ascending. County-wide the
  // top four are FIRST FINANCIAL GROUP LLC (321), METRO AIR AUTH (220), CITY OF ROCK ISLAND
  // (218) and CITY OF MOLINE (208).
  await expect(rows.first()).toContainText("FIRST FINANCIAL GROUP LLC");
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

  // The map opens on the whole county now, so the old "the canvas centre is always inside a
  // known parcel" assumption is dead. `show-incomplete` is the deterministic replacement: it
  // focuses meta.incompletePins[0] and flies to its centroid at zoom 15. `data-camera-zoom`
  // is published on `moveend`, so waiting for it is race-free — a click dispatched mid-flight
  // would interrupt MapLibre's animation and hit-test halfway across the county.
  await page.getByTestId("show-incomplete").click();
  await expect(details).toContainText("Parcel ID (PIN)");
  await expect(map).toHaveAttribute("data-camera-zoom", "15.00", { timeout: 30000 });

  // That parcel is deliberately one with missing source fields, and county-wide
  // incompletePins[0] (PIN 0331120001) publishes no owner1_name at all — so it has no CRM
  // owner record by design. This test needs a parcel that HAS an owner, so it clicks
  // outwards from the centre until the details panel offers the owner link. Its neighbours
  // sit 65-200 m away, which is 18-56 px at zoom 15.
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  const offsets = [
    [0, -40],
    [40, 0],
    [-40, 0],
    [0, 40],
    [60, -60],
    [-60, 60],
    [60, 60],
    [-60, -60],
  ] as const;
  let attempt = 0;
  await expect(async () => {
    const [dx, dy] = offsets[attempt % offsets.length];
    attempt += 1;
    await page.mouse.click(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy);
    await expect(details).toContainText("Parcel ID (PIN)", { timeout: 2000 });
    await expect(page.getByTestId("open-owner-record")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60000 });

  const ownerRowText = (await details.locator('[data-field="owner"] dd').innerText()).trim();

  await page.getByTestId("open-owner-record").click();

  const record = page.getByTestId("owner-record");
  await expect(record).toBeVisible();
  await expect(record.locator("h2")).toHaveText(ownerRowText);
});
