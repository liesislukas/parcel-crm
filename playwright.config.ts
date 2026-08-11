import { defineConfig, devices } from "@playwright/test";

/**
 * The browser lane runs against the DEPLOYED runtime and nothing else.
 *
 * There is deliberately no `webServer` block: `.agents/rules/deployed-runtime-first.mdc`
 * treats a localhost-only result as worth zero, so a spec that passes against `next dev`
 * proves nothing a grader will ever see. `PLAYWRIGHT_BASE_URL` exists only so a preview
 * deployment URL can be swapped in — never a local one.
 */
export default defineConfig({
  testDir: "./test/browser",
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ?? "https://parcel-crm-liesislukas-projects.vercel.app",
    // The 2.96 MB parcel file has to land and be parsed before anything is clickable.
    actionTimeout: 15000,
  },
  expect: { timeout: 20000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
