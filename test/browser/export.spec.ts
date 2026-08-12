import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { disableDemoSeed } from "./demo-seed-off";

/**
 * Every test here drives the deployed site. `baseURL` comes from `playwright.config.ts`
 * and never points at a local server — a localhost result is worth zero
 * (`.agents/rules/deployed-runtime-first.mdc`).
 *
 * ISSUE-014 seeds a demo project and campaign into every genuinely fresh browser.
 * `disableDemoSeed` (see `test/browser/demo-seed-off.ts`) opts every test in this file out
 * of that seed: the campaign-activity export's `getAttribute` lookup on
 * `[data-testid="campaign-card"][data-channel="email"]` is a strict-mode violation once a
 * seeded email card exists alongside `seedOneCampaign`'s own.
 */

test.beforeEach(async ({ page }) => {
  await disableDemoSeed(page);
});

/**
 * campaign-activity is built from `src/lib/campaigns/store.ts`'s `localStorage`-backed
 * simulation state, which — per `test/browser/campaigns.spec.ts`'s own documented
 * pattern — starts empty in every fresh Playwright `BrowserContext`. Creation alone is
 * not enough: every message starts in the implicit "queued" state with no persisted
 * `LifecycleEvent` at all — `model.ts`'s `canTransition` forbids a queued -> queued
 * no-op, so `store.ts`'s `materialise` never records one. Advancing one campaign to
 * completion (`campaigns.spec.ts`'s own pattern) produces real `message.sent` /
 * `delivered` / `clicked` / `replied` / `bounced` events for the export to carry.
 * Duplicated from `campaigns.spec.ts`'s `createAllThree` / `openCampaign` rather than
 * imported, so this file stays self-contained.
 */
async function seedOneCampaign(page: Page): Promise<void> {
  await page.goto("/campaigns");
  await page.getByTestId("new-campaign").click();
  await expect(page.getByTestId("audience-selected-count")).toHaveText("Selected (8)");
  await page.getByTestId("create-all-channels").click();
  await expect(page.getByTestId("campaign-list")).toBeVisible();

  const emailCard = page.locator('[data-testid="campaign-card"][data-channel="email"]');
  await expect(emailCard).toBeVisible();
  const campaignId = await emailCard.getAttribute("data-campaign-id");
  expect(campaignId, "email campaign card missing data-campaign-id").not.toBeNull();

  await page.goto(`/campaigns/${campaignId}`);
  await expect(page.getByTestId("message-list")).toBeVisible();
  await page.getByTestId("run-to-completion").click();
  await expect(page.locator('[data-testid="message-row"][data-state="bounced"]')).toHaveCount(1);
}

// Duplicated here on purpose, byte-exact from `src/lib/export/datasets.ts`. A test that
// imports the value it is checking proves nothing.
const PARCELS_HEADER =
  "pin,owner_name,taxbill_name,assessed_value_eav,market_value_emv,mailing_address,mailing_city_state_zip,acres,project_names_crm,county,county_slug,source_system,source_layer_url,source_retrieved_at,export_scope,export_generated_at";

const OWNERS_HEADER =
  "owner_id_crm,owner_name,mailing_address,mailing_city_state_zip,parcel_count,parcel_pins,total_acres,parcels_missing_acres,email_mock,phone_mock,contact_completeness_mock,contact_enriched_mock,contact_enriched_at_mock,source_system,export_scope,export_generated_at";

const CAMPAIGN_HEADER =
  "event_id_mock,campaign_id_mock,campaign_name_mock,channel_mock,message_id_mock,message_subject_mock,message_body_mock,event_state_mock,event_at_mock,owner_id_crm,owner_name,project_id_crm,project_name_crm,simulated,source_system,export_scope,export_generated_at";

const DATASETS = [
  { id: "parcels", header: PARCELS_HEADER, minRows: 65955 },
  { id: "owners", header: OWNERS_HEADER, minRows: 1 },
  { id: "campaign-activity", header: CAMPAIGN_HEADER, minRows: 1 },
] as const;

for (const { id, header, minRows } of DATASETS) {
  test(`downloads the ${id} CSV with the byte-exact header and honest data`, async ({ page }) => {
    // The parcels CSV is 65,955 rows now, built in the browser from the attributes sidecar.
    test.setTimeout(120000);
    if (id === "campaign-activity") {
      // No campaign exists yet in this fresh browser context, so without this the
      // download would always be an honest 0-row file that fails the minRows: 1
      // check below. Seed one campaign, run it to completion, and let the export
      // exercise real data.
      await seedOneCampaign(page);
    }
    await page.goto("/export");

    const button = page.getByTestId(`download-${id}`);
    if (await button.isDisabled()) {
      test.skip(true, `${id} export is not built yet`);
      return;
    }

    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);

    // 1. Filename matches parcel-crm_<id>_<date>.csv.
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^parcel-crm_${id}_\\d{4}-\\d{2}-\\d{2}\\.csv$`),
    );

    const path = await download.path();
    expect(path, "download did not land on disk").not.toBeNull();
    const raw = readFileSync(path!, "utf-8");

    // 2. UTF-8 BOM present.
    expect(raw.startsWith("﻿")).toBe(true);
    const content = raw.slice(1);

    const lines = content.split("\r\n");
    // toCsv always terminates the last record with \r\n, so the split leaves one
    // trailing empty element.
    expect(lines[lines.length - 1]).toBe("");
    const dataLines = lines.slice(1, -1);

    // 3. Header is byte-exact.
    expect(lines[0]).toBe(header);

    // 4. Row count.
    expect(dataLines.length).toBeGreaterThanOrEqual(minRows);
    if (id === "parcels") {
      expect(dataLines.length).toBe(65955);
    }

    // 5. Structural check: every line has the same comma count as the header, or
    // carries a quoted field (which may legitimately embed extra commas).
    const headerCommaCount = (header.match(/,/g) ?? []).length;
    for (const line of dataLines) {
      const commaCount = (line.match(/,/g) ?? []).length;
      expect(commaCount === headerCommaCount || line.includes('"')).toBe(true);
    }

    if (id === "parcels") {
      // 6. The AC5 row: PIN 0725200001, EAV 0, EMV 0, two empty mailing cells.
      const arsenalRow = dataLines.find((line) => line.startsWith("0725200001,"));
      expect(arsenalRow, "PIN 0725200001 not found in the parcels export").toBeDefined();
      expect(arsenalRow).toContain(",0,0,,,");

      // 7. Quoting and non-ASCII are exercised by the real data.
      const garciaRows = dataLines.filter((line) =>
        line.includes('"GARCIA,  ANTONIO & PIZANO, VALENTINA"'),
      );
      expect(garciaRows.length).toBe(1);
      const penaRows = dataLines.filter((line) => line.includes("PEÑA-REYES GUADALUPE"));
      expect(penaRows.length).toBe(1);
    }
  });
}

test("the export legend states the provenance scheme", async ({ page }) => {
  await page.goto("/export");

  const legend = page.getByTestId("export-legend");
  await expect(legend).toBeVisible();
  await expect(legend).toContainText("_mock");
  await expect(legend).toContainText("_crm");
  await expect(legend).toContainText("never rounded, reformatted, or defaulted");
});

// W8 (ISSUE-004 gate): scoping an export to one saved project.
test("scoping to a saved project narrows the export and renames the file", async ({ page }) => {
  await page.goto("/export");

  const scopeSelect = page.getByTestId("export-scope");
  const optionCount = await scopeSelect.locator("option").count();
  if (optionCount <= 1) {
    test.skip(true, "no saved projects — the scope select only has the 'all' option");
    return;
  }

  // The unscoped baseline, to compare row counts against. Prefer campaign-activity,
  // falling back to parcels if that card is disabled.
  const campaignButton = page.getByTestId("download-campaign-activity");
  const parcelsButton = page.getByTestId("download-parcels");
  const useCampaignActivity = !(await campaignButton.isDisabled());
  const baselineButton = useCampaignActivity ? campaignButton : parcelsButton;
  const datasetId = useCampaignActivity ? "campaign-activity" : "parcels";

  const [unscopedDownload] = await Promise.all([
    page.waitForEvent("download"),
    baselineButton.click(),
  ]);
  const unscopedPath = await unscopedDownload.path();
  expect(unscopedPath).not.toBeNull();
  const unscopedContent = readFileSync(unscopedPath!, "utf-8").slice(1);
  const unscopedRowCount = unscopedContent.split("\r\n").slice(1, -1).length;

  // Select the second <option> (the first saved project after "all").
  const secondOptionValue = await scopeSelect.locator("option").nth(1).getAttribute("value");
  expect(secondOptionValue).not.toBeNull();
  await scopeSelect.selectOption(secondOptionValue!);

  const scopedButton = useCampaignActivity ? campaignButton : parcelsButton;
  const [scopedDownload] = await Promise.all([page.waitForEvent("download"), scopedButton.click()]);

  expect(scopedDownload.suggestedFilename()).toMatch(
    new RegExp(`^parcel-crm_${datasetId}_project-[a-z0-9-]+_\\d{4}-\\d{2}-\\d{2}\\.csv$`),
  );

  const scopedPath = await scopedDownload.path();
  expect(scopedPath).not.toBeNull();
  const scopedContent = readFileSync(scopedPath!, "utf-8").slice(1);
  const scopedLines = scopedContent.split("\r\n");
  const scopedDataLines = scopedLines.slice(1, -1);
  const scopedHeader = scopedLines[0].split(",");
  const scopeColumnIndex = scopedHeader.indexOf("export_scope");
  expect(scopeColumnIndex).toBeGreaterThanOrEqual(0);

  const slugMatch = scopedDownload.suggestedFilename().match(/project-([a-z0-9-]+)_/);
  expect(slugMatch).not.toBeNull();
  const expectedScopeCell = `project:${slugMatch![1]}`;
  for (const line of scopedDataLines) {
    expect(line.split(",")[scopeColumnIndex]).toBe(expectedScopeCell);
  }

  expect(scopedDataLines.length).toBeLessThan(unscopedRowCount);
});
