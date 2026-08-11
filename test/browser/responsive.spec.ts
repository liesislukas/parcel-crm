import { expect, test, type Page } from "@playwright/test";

/**
 * Breakpoint lane, ported from `soofi-xyz-team-kit/skills/responsive-design-tests`: the
 * `test/browser` location, the breakpoint config-object shape, and the assertion priority
 * order below. The skill's Figma-intake gate is deliberately skipped — there is no Figma
 * reference for this build.
 *
 * Runs against the deployed URL via `baseURL`. Never a local server.
 */
const BREAKPOINTS = [
  { name: "Mobile", viewport: { width: 320, height: 900 } },
  { name: "Tablet", viewport: { width: 768, height: 1024 } },
  { name: "Desktop", viewport: { width: 1440, height: 900 } },
];

/** The map only exists once the 2.96 MB parcel file has landed and MapLibre has booted. */
async function waitForMapReady(page: Page): Promise<void> {
  await expect(page.getByTestId("selection-summary")).toBeVisible();
  await expect(page.getByTestId("parcel-map")).toBeVisible();
  await expect(page.getByTestId("parcel-map").locator("canvas").first()).toBeVisible();
}

for (const breakpoint of BREAKPOINTS) {
  test(`${breakpoint.name} (${breakpoint.viewport.width}px) renders the parcel workspace`, async ({
    page,
  }) => {
    await page.setViewportSize(breakpoint.viewport);
    await page.goto("/");
    await waitForMapReady(page);

    // 1. Component visibility — everything the Demo Script touches is on screen.
    await expect(page.getByTestId("parcel-map")).toBeVisible();
    await expect(page.getByTestId("selection-summary")).toBeVisible();
    await expect(page.getByTestId("draw-area")).toBeVisible();
    await expect(page.getByTestId("clear-selection")).toBeVisible();

    // 2. Layout mode — at 320 px the sidebar and content stack vertically instead of
    //    sharing the row, so `main` keeps a usable width.
    const mainWidth = await page.evaluate(
      () => document.querySelector("main")?.getBoundingClientRect().width ?? 0,
    );
    expect(mainWidth, `${breakpoint.name}: main width`).toBeGreaterThanOrEqual(300);

    // 3. No horizontal overflow or clipping.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      overflow.scrollWidth,
      `${breakpoint.name}: scrollWidth ${overflow.scrollWidth} vs innerWidth ${overflow.innerWidth}`,
    ).toBeLessThanOrEqual(overflow.innerWidth + 1);

    // 4. Spacing — the map keeps the `min-h-[360px]` floor set in W4.
    const mapBox = await page.getByTestId("parcel-map").boundingBox();
    expect(mapBox, `${breakpoint.name}: map bounding box`).not.toBeNull();
    expect(mapBox!.height, `${breakpoint.name}: map height`).toBeGreaterThanOrEqual(360);

    // 5. Typography — the selection count stays legible.
    const fontSize = await page
      .getByTestId("selection-count")
      .evaluate((el) => Number.parseFloat(window.getComputedStyle(el).fontSize));
    expect(fontSize, `${breakpoint.name}: selection-count font-size`).toBeGreaterThanOrEqual(11);

    // 6. Attribution visible, not collapsed. Licence compliance, not cosmetics:
    //    OpenStreetMap's tile usage policy forbids attribution hidden behind a toggle,
    //    which is why W4 sets `compact: false`. This must hold at 320 px too.
    const attribution = page.locator(".maplibregl-ctrl-attrib");
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText("OpenStreetMap");
    await expect(attribution).toContainText("Rock Island County GIS");
  });
}
