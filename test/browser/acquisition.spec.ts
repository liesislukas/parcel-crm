import { expect, test } from "@playwright/test";

/**
 * Mirrors ISSUE-007's Demo Script against the deployed runtime. Playwright gives each
 * `test()` a fresh browser context, so every test starts from an empty `localStorage` and
 * therefore the seeded store — which is why the create → filter → complete walk is one
 * test rather than three: state cannot be shared between `test()` blocks.
 *
 * Runs against the deployed URL via `baseURL`. Never a local server.
 */

test("the acquisitions pipeline lists the seeded records", async ({ page }) => {
  await page.goto("/acquisitions");

  await expect(page.getByTestId("pipeline-count")).toHaveText("15 records shown");
  await expect(page.getByTestId("pipeline-row")).toHaveCount(15);

  const provenanceNote = page.getByTestId("crm-provenance-note");
  await expect(provenanceNote).toBeVisible();
  await expect(provenanceNote).toContainText("no CRM back end");

  await expect(page.locator('[data-testid="stage-chip"][data-stage="closed-lost"]')).toBeVisible();
});

test("interest, asking price and stage persist across a reload", async ({ page }) => {
  await page.goto("/acquisitions?record=owner&id=CRESTHILL%20PRESERV%20GRP%20LLC");

  await expect(page.getByTestId("record-title")).toHaveText("CRESTHILL PRESERV GRP LLC");

  await page.getByTestId("interest-select").selectOption("interested");
  await page.getByTestId("asking-price-input").fill("1250000");
  await page.getByTestId("save-acquisition").click();

  const negotiatingOption = page.locator('[data-testid="stage-option"][data-stage="negotiating"]');
  await negotiatingOption.click();
  await expect(negotiatingOption).toHaveAttribute("data-current", "true");

  await page.reload();

  await expect(page.getByTestId("interest-select")).toHaveValue("interested");
  await expect(page.getByTestId("asking-price-input")).toHaveValue("1250000");
  await expect(
    page.locator('[data-testid="stage-option"][data-stage="negotiating"]'),
  ).toHaveAttribute("data-current", "true");

  await expect(page.getByTestId("record-history")).toContainText(
    "Stage changed from Contacted to Negotiating.",
  );
});

test("a task assigned on a record appears under its assignee in Tasks and completes into history", async ({
  page,
}) => {
  await page.goto("/acquisitions?record=owner&id=CRESTHILL%20PRESERV%20GRP%20LLC");

  await page.getByTestId("task-title-input").fill("Send signed LOI to Cresthill");
  await page.getByTestId("task-assignee-select").selectOption("tm-riley-nunez");
  await page.getByTestId("task-due-input").fill("2027-03-15");
  await page.getByTestId("create-task").click();

  await expect(page.getByTestId("record-task")).toContainText("Send signed LOI to Cresthill");
  await expect(page.getByTestId("next-step")).not.toContainText("Next step: none");

  await page.goto("/tasks");
  await page.getByTestId("assignee-filter").selectOption("tm-riley-nunez");
  const rileyRow = page.locator('[data-testid="task-row"]', {
    hasText: "Send signed LOI to Cresthill",
  });
  await expect(rileyRow).toBeVisible();

  await page.getByTestId("assignee-filter").selectOption("tm-avery-cole");
  await expect(
    page.locator('[data-testid="task-row"]', { hasText: "Send signed LOI to Cresthill" }),
  ).toHaveCount(0);

  await page.getByTestId("assignee-filter").selectOption("tm-riley-nunez");
  await page
    .locator('[data-testid="task-row"]', { hasText: "Send signed LOI to Cresthill" })
    .getByTestId("complete-task")
    .click();

  await page.getByTestId("status-filter").selectOption("done");
  const completedRow = page.locator('[data-testid="task-row"]', {
    hasText: "Send signed LOI to Cresthill",
  });
  await expect(completedRow).toBeVisible();
  await expect(completedRow).toContainText("Done");

  await page.goto("/acquisitions?record=owner&id=CRESTHILL%20PRESERV%20GRP%20LLC");
  await expect(page.getByTestId("record-history")).toContainText(
    "Task completed: Send signed LOI to Cresthill",
  );
});

test("the acquisition routes hold up at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });

  for (const path of ["/acquisitions", "/tasks"]) {
    await page.goto(path);
    const testid = path === "/acquisitions" ? "acquisitions-workspace" : "tasks-workspace";
    await expect(page.getByTestId(testid)).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      overflow.scrollWidth,
      `${path}: scrollWidth ${overflow.scrollWidth} vs innerWidth ${overflow.innerWidth}`,
    ).toBeLessThanOrEqual(overflow.innerWidth + 1);
  }
});
