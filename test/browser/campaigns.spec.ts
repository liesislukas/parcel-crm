import { expect, test, type Page } from "@playwright/test";
import { disableDemoSeed } from "./demo-seed-off";

/**
 * The campaigns simulation lane. Runs against the deployed URL via `baseURL` in
 * `playwright.config.ts` — never a local server; see `.agents/rules/deployed-runtime-first.mdc`.
 *
 * Every Playwright test gets a fresh `BrowserContext`, so `localStorage` (the only place
 * `src/lib/campaigns/store.ts` persists anything) starts empty in every test. Each test
 * that needs a simulation creates its own via `createAllThree`.
 *
 * ISSUE-014 seeds a demo project and a three-channel campaign into every genuinely fresh
 * browser. `disableDemoSeed` (see `test/browser/demo-seed-off.ts`) opts every test in this
 * file out of that seed — this file's own assertions (`no-campaigns` on a fresh context,
 * `toHaveCount(3)` after creating exactly one campaign) require a browser the seed never
 * touched.
 */

test.beforeEach(async ({ page }) => {
  await disableDemoSeed(page);
});

/**
 * `/campaigns` → new campaign → default 8-owner audience → all three channels, then back
 * on `/campaigns` with the resulting campaign list rendered.
 */
async function createAllThree(page: Page): Promise<void> {
  await page.goto("/campaigns");
  await page.getByTestId("new-campaign").click();
  await expect(page.getByTestId("audience-selected-count")).toHaveText("Selected (8)");
  await page.getByTestId("create-all-channels").click();
  await expect(page.getByTestId("campaign-list")).toBeVisible();
}

/** Opens the single campaign card for `channel` and waits for its message list to render. */
async function openCampaign(page: Page, channel: "email" | "sms" | "direct_mail"): Promise<string> {
  const card = page.locator(`[data-testid="campaign-card"][data-channel="${channel}"]`);
  await expect(card).toBeVisible();
  const campaignId = await card.getAttribute("data-campaign-id");
  expect(campaignId, `data-campaign-id missing on the ${channel} campaign card`).not.toBeNull();
  await page.goto(`/campaigns/${campaignId}`);
  await expect(page.getByTestId("message-list")).toBeVisible();
  return campaignId!;
}

test("the deployed campaigns page states the simulation and offers a new campaign", async ({
  page,
}) => {
  await page.goto("/campaigns");

  const banner = page.getByTestId("simulation-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("nothing here is ever sent");
  await expect(banner).toContainText(".invalid");

  await expect(page.getByTestId("no-campaigns")).toBeVisible();
  await expect(page.getByTestId("new-campaign")).toBeVisible();
});

test("the audience picker shows mocked contact details beside county-sourced addresses", async ({
  page,
}) => {
  await page.goto("/campaigns/new");

  const rows = page.getByTestId("audience-row");
  await expect(rows.first()).toBeVisible();
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(8);

  await expect(page.locator('[data-provenance="mocked"]').first()).toBeVisible();
  await expect(page.locator('[data-provenance="county-source"]').first()).toBeVisible();

  await expect(page.locator("body")).toContainText("No county mailing address on file");
});

test("creating all three channels produces three simulated campaigns", async ({ page }) => {
  await createAllThree(page);

  const cards = page.getByTestId("campaign-card");
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(cards.nth(i).getByTestId("simulated-badge")).toBeVisible();
  }

  await expect(page.locator('[data-testid="campaign-card"][data-channel="email"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="campaign-card"][data-channel="sms"]')).toHaveCount(1);
  const mailCard = page.locator('[data-testid="campaign-card"][data-channel="direct_mail"]');
  await expect(mailCard).toHaveCount(1);
  await expect(mailCard).toContainText("skipped");

  // Responsive guard, matching the standard `test/browser/responsive.spec.ts` already holds.
  await page.setViewportSize({ width: 320, height: 900 });
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
});

test("advancing the simulation moves messages through the lifecycle", async ({ page }) => {
  await createAllThree(page);
  await openCampaign(page, "email");

  const rows = page.getByTestId("message-row");
  await expect(rows.first()).toBeVisible();
  const rowCount = await rows.count();
  for (let i = 0; i < rowCount; i++) {
    await expect(rows.nth(i).getByTestId("message-state")).toHaveText("Queued");
  }

  await page.getByTestId("advance-simulation").click();
  await expect(
    page.locator('[data-testid="message-row"]:not([data-state="queued"])').first(),
  ).toBeVisible();

  await page.getByTestId("run-to-completion").click();
  await expect(page.locator('[data-testid="message-row"][data-state="bounced"]')).toHaveCount(1);

  const states = new Set(
    await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-state"))),
  );
  for (const expected of ["delivered", "clicked", "replied", "bounced"]) {
    expect(
      states.has(expected),
      `expected state "${expected}" among [${[...states].join(", ")}]`,
    ).toBe(true);
  }
});

test("campaign counts equal the message list tally", async ({ page }) => {
  await createAllThree(page);
  await openCampaign(page, "email");

  await page.getByTestId("run-to-completion").click();
  await expect(page.locator('[data-testid="message-row"][data-state="bounced"]')).toHaveCount(1);

  const counts = page.getByTestId("campaign-counts");
  const readCount = async (attr: string): Promise<number> =>
    Number(await counts.getAttribute(attr));
  const fromCounts = {
    sent: await readCount("data-count-sent"),
    delivered: await readCount("data-count-delivered"),
    clicked: await readCount("data-count-clicked"),
    replied: await readCount("data-count-replied"),
    bounced: await readCount("data-count-bounced"),
  };

  const tally = async (fact: string): Promise<number> =>
    page.locator(`[data-testid="message-timeline"] li[data-fact="${fact}"]`).count();
  const fromTimelines = {
    sent: await tally("message.sent"),
    delivered: await tally("message.delivered"),
    clicked: await tally("short_url.visited"),
    replied: await tally("message.replied"),
    bounced: await tally("message.bounced"),
  };

  expect(fromCounts).toEqual(fromTimelines);
  // The deterministic W6 prediction for an 8-recipient email audience: outcomes are
  // assigned by position (`recipientIndex % 8`), not by a random draw.
  expect(fromCounts).toEqual({ sent: 8, delivered: 7, clicked: 4, replied: 2, bounced: 1 });
  expect(fromCounts.delivered + fromCounts.bounced).toBe(fromCounts.sent);
});

test("the short link records a click and the portal login", async ({ page }) => {
  await createAllThree(page);
  await openCampaign(page, "email");

  await page.getByTestId("run-to-completion").click();
  await expect(page.locator('[data-testid="message-row"][data-state="bounced"]')).toHaveCount(1);

  const row = page
    .locator(
      '[data-testid="message-row"][data-state="delivered"], [data-testid="message-row"][data-state="opened"]',
    )
    .first();
  await expect(row).toBeVisible();
  const messageId = await row.getAttribute("data-message-id");

  await row.getByTestId("short-link").click();
  await page.waitForURL(/\/campaigns\/offer\//);

  await page.getByTestId("portal-login").click();
  await expect(page.getByTestId("portal-logged-in")).toBeVisible();

  await page.getByTestId("back-to-campaign").click();
  await expect(page.getByTestId("message-list")).toBeVisible();

  const returnedRow = page.locator(`[data-testid="message-row"][data-message-id="${messageId}"]`);
  const timeline = returnedRow.getByTestId("message-timeline");
  await expect(timeline).toContainText("Short link clicked");
  await expect(timeline).toContainText("Logged into the application");

  const timelineText = await timeline.innerText();
  const recordedCount = (timelineText.match(/recorded in your browser/g) ?? []).length;
  expect(recordedCount, timelineText).toBeGreaterThanOrEqual(2);
});

test("a bounced message's short link is refused rather than faked", async ({ page }) => {
  await createAllThree(page);
  await openCampaign(page, "email");

  await page.getByTestId("run-to-completion").click();
  const row = page.locator('[data-testid="message-row"][data-state="bounced"]').first();
  await expect(row).toBeVisible();

  await row.getByTestId("short-link").click();

  await expect(page.getByTestId("short-link-refused")).toHaveText(
    "This message bounced in the simulation — the short link is dead.",
  );
});

test("a follow-up appears in the owner's contact history across channels", async ({ page }) => {
  await createAllThree(page);
  await openCampaign(page, "email");

  await page.getByTestId("run-to-completion").click();
  const row = page.locator('[data-testid="message-row"][data-state="bounced"]').first();
  await expect(row).toBeVisible();
  // The owner's name is the only visible label on the row's header — there is no
  // dedicated data-testid for it, so it is read as plain text and matched back against
  // the owner directory on `/campaigns` below.
  const ownerName = (await row.locator("span.font-medium").first().innerText()).trim();

  await row.getByTestId("open-follow-up").click();
  const channelSelect = row.getByTestId("follow-up-channel");
  await expect(channelSelect).toBeVisible();
  expect(await channelSelect.inputValue()).not.toBe("email");

  await row.getByTestId("create-follow-up").click();

  await page.goto("/campaigns");
  const ownerRow = page.locator('[data-testid="owner-directory"] li', { hasText: ownerName });
  await ownerRow.getByTestId("owner-history-link").click();

  const historyList = page.getByTestId("history-list");
  await expect(historyList).toBeVisible();
  const entries = historyList.getByTestId("history-entry");
  await expect(entries.first()).toBeVisible();

  const channels = await entries.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-channel")),
  );
  expect(new Set(channels).size).toBeGreaterThanOrEqual(2);

  // Every entry's visible text starts with its formatted `effectiveAt` timestamp,
  // followed by " · ". Chromium's Intl output sometimes separates the time from its
  // AM/PM marker with a narrow no-break space rather than a plain one; normalise before
  // handing the string to `Date.parse`.
  const rawTexts = await entries.evaluateAll((els) =>
    els.map((el) => el.querySelector("p")?.textContent?.trim() ?? ""),
  );
  const timestamps = rawTexts.map((text) => {
    const [stamp] = text.split(" · ");
    const normalised = stamp.replace(/[\u202f\u00a0]/g, " ");
    const parsed = Date.parse(normalised);
    expect(Number.isNaN(parsed), `could not parse timestamp "${stamp}"`).toBe(false);
    return parsed;
  });
  for (let i = 1; i < timestamps.length; i++) {
    expect(timestamps[i], `entry ${i} timestamp regressed`).toBeGreaterThanOrEqual(
      timestamps[i - 1],
    );
  }

  const facts = await entries.evaluateAll((els) => els.map((el) => el.getAttribute("data-fact")));
  expect(facts).toContain("followup.scheduled");
});
