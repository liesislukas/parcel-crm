import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Every test here drives the deployed site. `baseURL` comes from `playwright.config.ts`
 * and never points at a local server — a localhost result is worth zero
 * (`.agents/rules/deployed-runtime-first.mdc`).
 */

// Duplicated here on purpose, byte-exact from `src/lib/export/datasets.ts`. A test that
// imports the value it is checking proves nothing.
const PARCELS_HEADER =
  "pin,owner_name,taxbill_name,assessed_value_eav,market_value_emv,mailing_address,mailing_city_state_zip,acres,project_names_crm,county,county_slug,source_system,source_layer_url,source_retrieved_at,export_scope,export_generated_at";

const OWNERS_HEADER =
  "owner_id_crm,owner_name,mailing_address,mailing_city_state_zip,parcel_count,parcel_pins,total_acres,parcels_missing_acres,email_mock,phone_mock,contact_completeness_mock,contact_enriched_mock,contact_enriched_at_mock,source_system,export_scope,export_generated_at";

const CAMPAIGN_HEADER =
  "event_id_mock,campaign_id_mock,campaign_name_mock,channel_mock,message_id_mock,message_subject_mock,message_body_mock,event_state_mock,event_at_mock,owner_id_crm,owner_name,project_id_crm,project_name_crm,simulated,source_system,export_scope,export_generated_at";

const DATASETS = [
  { id: "parcels", header: PARCELS_HEADER, minRows: 6026 },
  { id: "owners", header: OWNERS_HEADER, minRows: 1 },
  { id: "campaign-activity", header: CAMPAIGN_HEADER, minRows: 1 },
] as const;

for (const { id, header, minRows } of DATASETS) {
  test(`downloads the ${id} CSV with the byte-exact header and honest data`, async ({ page }) => {
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
      expect(dataLines.length).toBe(6026);
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
