import { describe, expect, it } from "vitest";
import {
  ALL_STAGES,
  STAGE_ORDER,
  addDaysIso,
  defaultRecord,
  dueState,
  entityKey,
  nextStep,
  todayIso,
  type Task,
} from "@/lib/crm/acquisition";

describe("entityKey", () => {
  it("survives a slash and spaces in the id untouched", () => {
    expect(entityKey({ type: "owner", id: "ZETINA M/GRANJA O" })).toBe("owner:ZETINA M/GRANJA O");
  });
});

describe("todayIso", () => {
  it("builds from local parts, not toISOString, for a late evening", () => {
    expect(todayIso(new Date(2026, 7, 12, 23, 30))).toBe("2026-08-12");
  });
});

describe("addDaysIso", () => {
  it("adds across a month boundary", () => {
    expect(addDaysIso("2026-08-30", 3)).toBe("2026-09-02");
  });
  it("subtracts across a leap-year month boundary", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dueState", () => {
  it("classifies overdue, today, and upcoming", () => {
    expect(dueState("2026-08-11", "2026-08-12")).toBe("overdue");
    expect(dueState("2026-08-12", "2026-08-12")).toBe("today");
    expect(dueState("2026-08-13", "2026-08-12")).toBe("upcoming");
  });
});

describe("nextStep", () => {
  const entity = { type: "owner", id: "X", label: "X", detail: "" } as const;

  function task(overrides: Partial<Task>): Task {
    return {
      id: "t",
      title: "t",
      assigneeId: "tm-avery-cole",
      entity,
      dueDate: "2026-08-12",
      status: "open",
      createdAt: "2026-08-01T00:00:00.000Z",
      completedAt: null,
      seeded: false,
      ...overrides,
    };
  }

  it("returns null for an empty list", () => {
    expect(nextStep([])).toBeNull();
  });

  it("returns the open task with the earlier due date, ignoring done tasks", () => {
    const done = task({ id: "done", status: "done", dueDate: "2026-08-01" });
    const earlier = task({ id: "earlier", dueDate: "2026-08-10" });
    const later = task({ id: "later", dueDate: "2026-08-20" });
    const tasks = [done, later, earlier];
    const result = nextStep(tasks);
    expect(result?.id).toBe("earlier");
    // Input array order is unchanged after the call.
    expect(tasks.map((t) => t.id)).toEqual(["done", "later", "earlier"]);
  });

  it("tie-breaks equal due dates by earlier createdAt", () => {
    const a = task({ id: "a", dueDate: "2026-08-10", createdAt: "2026-08-02T00:00:00.000Z" });
    const b = task({ id: "b", dueDate: "2026-08-10", createdAt: "2026-08-01T00:00:00.000Z" });
    expect(nextStep([a, b])?.id).toBe("b");
  });
});

describe("stage vocabulary", () => {
  it("STAGE_ORDER has length 5 and excludes closed-lost", () => {
    expect(STAGE_ORDER).toHaveLength(5);
    expect(STAGE_ORDER).not.toContain("closed-lost");
  });
  it("ALL_STAGES has length 6", () => {
    expect(ALL_STAGES).toHaveLength(6);
  });
});

describe("defaultRecord", () => {
  it("asking price defaults to null, never 0", () => {
    const ref = { type: "owner", id: "X", label: "X", detail: "" } as const;
    const record = defaultRecord(ref, "2026-08-12T00:00:00.000Z");
    expect(record.askingPriceUsd).toBeNull();
  });
});
