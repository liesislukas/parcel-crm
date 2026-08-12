import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER_STATE,
  activeFilterCount,
  applyFilters,
  isRangeInverted,
  parseFilterState,
  toSearchParams,
  type FilterableProject,
} from "@/lib/projectFilters";

function makeProject(overrides: Partial<FilterableProject> = {}): FilterableProject {
  return {
    id: "p0",
    name: "Default",
    county: { present: true, value: "rock-island" },
    acres: { present: true, value: 100 },
    acresParcelsWithSource: 4,
    acresParcelsTotal: 4,
    powerNearestMiles: { present: false },
    outreachStatus: { present: true, value: "sent" },
    acquisitionStage: { present: true, value: "negotiating" },
    rawStage: null,
    rawOutreach: null,
    href: null,
    ...overrides,
  };
}

describe("applyFilters", () => {
  it("1. empty state matches every project", () => {
    const projects = [makeProject({ id: "a" }), makeProject({ id: "b" })];
    const outcome = applyFilters(projects, DEFAULT_FILTER_STATE);
    expect(outcome.matched.length).toBe(outcome.total);
    expect(outcome.matched.length).toBe(2);
  });

  it("2. acresMin keeps a 100-acre project and drops a 12-acre one", () => {
    const projects = [
      makeProject({ id: "big", acres: { present: true, value: 100 } }),
      makeProject({ id: "small", acres: { present: true, value: 12 } }),
    ];
    const outcome = applyFilters(projects, { ...DEFAULT_FILTER_STATE, acresMin: 40 });
    expect(outcome.matched.map((p) => p.id)).toEqual(["big"]);
  });

  it("3. acresMax keeps the 12-acre project and drops the 100-acre one", () => {
    const projects = [
      makeProject({ id: "big", acres: { present: true, value: 100 } }),
      makeProject({ id: "small", acres: { present: true, value: 12 } }),
    ];
    const outcome = applyFilters(projects, { ...DEFAULT_FILTER_STATE, acresMax: 50 });
    expect(outcome.matched.map((p) => p.id)).toEqual(["small"]);
  });

  it("4. a project with absent acres and acresMin set is hidden and counted, attributed to acres even when also unknown in stage", () => {
    const projects = [
      makeProject({
        id: "unknown-acres-and-stage",
        acres: { present: false },
        acquisitionStage: { present: false },
      }),
    ];
    const outcome = applyFilters(projects, {
      ...DEFAULT_FILTER_STATE,
      acresMin: 40,
      stages: ["negotiating"],
    });
    expect(outcome.matched.length).toBe(0);
    expect(outcome.hiddenAsUnknown.acres).toBe(1);
    expect(outcome.hiddenAsUnknown.stage).toBe(0);
  });

  it("5. powerMaxMiles null never hides an unknown-power project, even with every other filter set", () => {
    const projects = [
      makeProject({
        id: "unknown-power",
        powerNearestMiles: { present: false },
        acres: { present: true, value: 100 },
        outreachStatus: { present: true, value: "sent" },
        acquisitionStage: { present: true, value: "negotiating" },
      }),
    ];
    const outcome = applyFilters(projects, {
      ...DEFAULT_FILTER_STATE,
      acresMin: 1,
      outreach: ["sent"],
      stages: ["negotiating"],
      powerMaxMiles: null,
    });
    expect(outcome.matched.map((p) => p.id)).toEqual(["unknown-power"]);
    expect(outcome.hiddenAsUnknown.power).toBe(0);
  });

  it("6. powerMaxMiles 3 with includeUnknownPower true keeps unknown-power and 2.0 mi, drops 9.0 mi", () => {
    const projects = [
      makeProject({ id: "unknown", powerNearestMiles: { present: false } }),
      makeProject({ id: "near", powerNearestMiles: { present: true, value: 2.0 } }),
      makeProject({ id: "far", powerNearestMiles: { present: true, value: 9.0 } }),
    ];
    const outcome = applyFilters(projects, {
      ...DEFAULT_FILTER_STATE,
      powerMaxMiles: 3,
      includeUnknownPower: true,
    });
    expect(outcome.matched.map((p) => p.id).sort()).toEqual(["near", "unknown"]);
  });

  it("7. powerMaxMiles 3 with includeUnknownPower false hides the unknown-power project and counts it", () => {
    const projects = [
      makeProject({ id: "unknown", powerNearestMiles: { present: false } }),
      makeProject({ id: "near", powerNearestMiles: { present: true, value: 2.0 } }),
    ];
    const outcome = applyFilters(projects, {
      ...DEFAULT_FILTER_STATE,
      powerMaxMiles: 3,
      includeUnknownPower: false,
    });
    expect(outcome.matched.map((p) => p.id)).toEqual(["near"]);
    expect(outcome.hiddenAsUnknown.power).toBe(1);
  });

  it("8. outreach [replied] keeps only replied; absent outreach is counted as hidden", () => {
    const projects = [
      makeProject({ id: "replied", outreachStatus: { present: true, value: "replied" } }),
      makeProject({ id: "sent", outreachStatus: { present: true, value: "sent" } }),
      makeProject({ id: "unknown", outreachStatus: { present: false } }),
    ];
    const outcome = applyFilters(projects, { ...DEFAULT_FILTER_STATE, outreach: ["replied"] });
    expect(outcome.matched.map((p) => p.id)).toEqual(["replied"]);
    expect(outcome.hiddenAsUnknown.outreach).toBe(1);
  });

  it("9. stages [negotiating, under-contract] keeps both and drops closed-lost", () => {
    const projects = [
      makeProject({ id: "neg", acquisitionStage: { present: true, value: "negotiating" } }),
      makeProject({ id: "under", acquisitionStage: { present: true, value: "under-contract" } }),
      makeProject({ id: "lost", acquisitionStage: { present: true, value: "closed-lost" } }),
    ];
    const outcome = applyFilters(projects, {
      ...DEFAULT_FILTER_STATE,
      stages: ["negotiating", "under-contract"],
    });
    expect(outcome.matched.map((p) => p.id).sort()).toEqual(["neg", "under"]);
  });

  it("10. combined acresMin + outreach + stages narrows to exactly one project (AC6)", () => {
    const projects = [
      makeProject({
        id: "matches-all",
        acres: { present: true, value: 100 },
        outreachStatus: { present: true, value: "sent" },
        acquisitionStage: { present: true, value: "negotiating" },
      }),
      makeProject({
        id: "wrong-stage",
        acres: { present: true, value: 100 },
        outreachStatus: { present: true, value: "sent" },
        acquisitionStage: { present: true, value: "contacted" },
      }),
      makeProject({
        id: "too-small",
        acres: { present: true, value: 10 },
        outreachStatus: { present: true, value: "sent" },
        acquisitionStage: { present: true, value: "negotiating" },
      }),
    ];
    const outcome = applyFilters(projects, {
      ...DEFAULT_FILTER_STATE,
      acresMin: 40,
      outreach: ["sent"],
      stages: ["negotiating"],
    });
    expect(outcome.matched.map((p) => p.id)).toEqual(["matches-all"]);
  });

  it("11. round-trip: parseFilterState(toSearchParams(s)) deep-equals s; default state serialises empty", () => {
    const state = {
      county: "rock-island" as const,
      acresMin: 12.5,
      acresMax: 240,
      powerMaxMiles: 3,
      includeUnknownPower: false,
      outreach: ["sent", "replied"] as const,
      stages: ["negotiating", "closed-lost"] as const,
    };
    const roundTripped = parseFilterState(toSearchParams(state as never));
    expect(roundTripped).toEqual(state);
    expect(toSearchParams(DEFAULT_FILTER_STATE).toString()).toBe("");
  });

  it("12. garbage params fall back to defaults; inverted range yields zero matches", () => {
    const parsed = parseFilterState(new URLSearchParams("stage=banana&acresMin=-5&acresMax=abc"));
    expect(parsed).toEqual(DEFAULT_FILTER_STATE);

    const inverted = { ...DEFAULT_FILTER_STATE, acresMin: 90, acresMax: 10 };
    expect(isRangeInverted(inverted)).toBe(true);
    const outcome = applyFilters([makeProject()], inverted);
    expect(outcome.matched.length).toBe(0);
  });
});

describe("activeFilterCount", () => {
  it("counts zero for the default state", () => {
    expect(activeFilterCount(DEFAULT_FILTER_STATE)).toBe(0);
  });

  it("counts each active dimension once", () => {
    const state = {
      ...DEFAULT_FILTER_STATE,
      county: "rock-island" as const,
      acresMin: 10,
      powerMaxMiles: 3,
      includeUnknownPower: false,
      outreach: ["sent"] as const,
      stages: ["negotiating"] as const,
    };
    expect(activeFilterCount(state as never)).toBe(6);
  });
});
