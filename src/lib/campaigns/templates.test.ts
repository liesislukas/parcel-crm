import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Feature, Geometry } from "geojson";
import { toParcel, type Parcel, type RawParcelProperties } from "@/lib/parcel";
import { deriveOwners } from "@/lib/owners";
import { CHANNELS } from "@/lib/campaigns/model";
import {
  renderTemplate,
  SIMULATION_FOOTER,
  SMS_MAX_CHARS,
  TEMPLATES,
  templateFor,
  type TemplateFamily,
} from "./templates";

const FAMILIES: TemplateFamily[] = ["acquisition_intro", "acquisition_followup"];

const ALL_VARS: Record<string, string> = {
  owner_name: "SOME OWNER",
  parcel_count: "3",
  total_acres: "12.34 ac",
  project_name: "Test Project",
  mailing_address: "123 MAIN ST\nROCK ISLAND IL 61201",
  short_url: "https://ri.invalid/r/ABCDE12345",
  sender_name: "Elephant Land Acquisition (simulated)",
};

function tokensIn(text: string): Set<string> {
  const set = new Set<string>();
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
    set.add(match[1]);
  }
  return set;
}

describe("TEMPLATES", () => {
  it("has exactly six templates, one per family x channel, each with a distinct templateId", () => {
    expect(TEMPLATES.length).toBe(6);
    const ids = new Set<string>();
    for (const family of FAMILIES) {
      for (const channel of CHANNELS) {
        const t = templateFor(family, channel);
        expect(t.family).toBe(family);
        expect(t.channel).toBe(channel);
        ids.add(t.templateId);
      }
    }
    expect(ids.size).toBe(6);
  });

  it("declares a variables array equal to the tokens present in its subject + body, both directions", () => {
    for (const t of TEMPLATES) {
      const present = tokensIn((t.subject ?? "") + t.body);
      const declared = new Set(t.variables);
      expect(declared).toEqual(present);
    }
  });

  it("acquisition_intro.email has a subject; acquisition_intro.sms does not", () => {
    expect(templateFor("acquisition_intro", "email").subject).not.toBeNull();
    expect(templateFor("acquisition_intro", "sms").subject).toBeNull();
  });
});

describe("renderTemplate", () => {
  it("leaves no {{ in the output when every variable is supplied", () => {
    const rendered = renderTemplate(templateFor("acquisition_intro", "email"), ALL_VARS);
    expect(rendered).not.toContain("{{");
  });

  it("throws with the exact no-silent-fallback message on a missing variable", () => {
    expect(() => renderTemplate(TEMPLATES[0], {})).toThrow(/^unknown template variable: /);
  });

  it("every rendered output ends with the simulation footer", () => {
    for (const t of TEMPLATES) {
      const rendered = renderTemplate(t, ALL_VARS);
      expect(rendered.endsWith(SIMULATION_FOOTER)).toBe(true);
    }
  });

  it("keeps the rendered sms intro within SMS_MAX_CHARS for the longest real owner name", () => {
    const raw = JSON.parse(readFileSync("public/data/rock-island-parcels.json", "utf8")) as {
      features: Feature<Geometry, RawParcelProperties>[];
    };
    const parcels: Parcel[] = raw.features.map(toParcel);
    const owners = deriveOwners(parcels);
    const longestName = owners.reduce(
      (longest, o) => (o.ownerName.length > longest.length ? o.ownerName : longest),
      "",
    );

    const rendered = renderTemplate(templateFor("acquisition_intro", "sms"), {
      ...ALL_VARS,
      owner_name: longestName,
    });

    expect(rendered.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
  });

  it("only ever emits the reserved ri.invalid host, never a real URL", () => {
    for (const t of TEMPLATES) {
      const rendered = renderTemplate(t, ALL_VARS);
      expect(rendered).not.toMatch(/https?:\/\/(?!ri\.invalid)/);
    }
  });
});

describe("no hard-coded link outside the short_url variable", () => {
  it("contains no literal http in body or subject outside a {{...}} token", () => {
    for (const t of TEMPLATES) {
      const text = ((t.subject ?? "") + t.body).replace(/\{\{\w+\}\}/g, "");
      expect(text).not.toContain("http");
    }
  });
});
