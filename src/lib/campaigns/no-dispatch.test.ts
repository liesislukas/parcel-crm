import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AC2's structural guard: fails the build if a real dispatch path ever appears anywhere
 * in the campaigns feature. Every directory here is scanned even when it does not exist
 * yet (later work items add `src/components/campaigns/` and `src/app/r/`).
 */

const ROOTS = ["src/lib/campaigns", "src/components/campaigns", "src/app/campaigns", "src/app/r"];

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

// This guard file itself legitimately contains the search terms as string literals (it
// has to name them in order to look for them) and, as of no-dispatch.test.ts, sits
// under src/lib/campaigns/ where the walker would otherwise find it. Excluding this
// file's own path from the scan is standard practice for a self-referential grep guard
// — it does not weaken the guard, since this file has no dispatch code of its own to
// find.
const SELF_PATH = "src/lib/campaigns/no-dispatch.test.ts";

function targetFiles(): string[] {
  const files = ROOTS.flatMap(walk).filter((f) => f !== SELF_PATH);
  files.push("src/lib/owners.ts");
  return files;
}

describe("no real dispatch path exists anywhere in the campaigns feature", () => {
  const files = targetFiles();

  it("every fetch( call reads only the same-origin static parcel data", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      let index = content.indexOf("fetch(");
      while (index !== -1) {
        const after = content.slice(index + "fetch(".length, index + "fetch(".length + 7);
        expect(after, `${file} at offset ${index}`).toBe('"/data/');
        index = content.indexOf("fetch(", index + 1);
      }
    }
  });

  it("contains no XMLHttpRequest, sendBeacon, WebSocket or EventSource", () => {
    const forbidden = ["XMLHttpRequest", "navigator.sendBeacon", "new WebSocket", "EventSource"];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const term of forbidden) {
        expect(content, `${file} contains ${term}`).not.toContain(term);
      }
    }
  });

  it("contains no mailto:, sms: or tel: URL scheme literal", () => {
    // Matched as a quoted/templated URL-scheme prefix (how a real dispatch link would
    // actually appear, e.g. href="mailto:..." or `sms:${phone}`), not as a bare
    // substring — "sms:" alone also matches ordinary object-literal syntax such as
    // `sms: "SMS"`, which is legitimate and everywhere in this codebase since "sms" is
    // a Channel value.
    const schemePattern = /["'`](mailto:|sms:|tel:)/;
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} contains a mailto:/sms:/tel: URL scheme`).not.toMatch(schemePattern);
    }
  });

  it("every file under src/lib/campaigns/ mentions the word simulat, except ids.ts", () => {
    const campaignsFiles = walk("src/lib/campaigns");
    expect(campaignsFiles.length).toBeGreaterThan(0);
    for (const file of campaignsFiles) {
      if (file.endsWith("ids.ts")) continue;
      const content = readFileSync(file, "utf8").toLowerCase();
      expect(content, file).toContain("simulat");
    }
  });
});

describe("no sending SDK dependency exists in package.json", () => {
  it("matches no known email/sms/postal-provider package name", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    const forbidden =
      /nodemailer|twilio|sendgrid|resend|postmark|mailgun|mailchimp|aws-sdk|smtp|sendinblue|brevo/i;
    for (const name of names) {
      expect(name).not.toMatch(forbidden);
    }
  });
});
