import { beforeEach, describe, expect, it } from "vitest";
import {
  PROJECTS_STORAGE_KEY,
  createProject,
  deleteProject,
  findProject,
  loadProjects,
  replaceProjectPins,
} from "@/lib/projectStore";

/**
 * `vitest.config.ts` sets `environment: "node"`, so there is no real `localStorage`. This
 * stub is backed by a `Map` and installed fresh before every test.
 */
function installLocalStorageStub(): void {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installLocalStorageStub();
});

describe("projectStore", () => {
  it("returns [] from an empty store", () => {
    expect(loadProjects()).toEqual([]);
  });

  it("creates a project with deduplicated pins and persists it across a reload", () => {
    const created = createProject("North Assemblage", ["A", "B", "A"]);

    expect(created.pins).toEqual(["A", "B"]);
    expect(created.id).not.toBe("");

    const reloaded = loadProjects();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe(created.id);
    expect(reloaded[0].pins).toEqual(["A", "B"]);
  });

  it("throws when the trimmed name is empty", () => {
    expect(() => createProject("   ", ["A"])).toThrowError("Project name is required");
  });

  it("replaces pins and bumps updatedAt; an unknown id returns null", () => {
    const created = createProject("Assemblage", ["A", "B"]);
    const updated = replaceProjectPins(created.id, ["A", "C"]);

    expect(updated).not.toBeNull();
    expect(updated!.pins).toEqual(["A", "C"]);
    expect(updated!.updatedAt >= created.updatedAt).toBe(true);

    expect(replaceProjectPins("does-not-exist", ["A"])).toBeNull();
  });

  it("deletes only the targeted project", () => {
    const first = createProject("First", ["A"]);
    const second = createProject("Second", ["B"]);

    deleteProject(first.id);

    const remaining = loadProjects();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
    expect(findProject(first.id)).toBeNull();
  });

  it("returns [] for garbage stored data and leaves the raw value untouched", () => {
    globalThis.localStorage.setItem(PROJECTS_STORAGE_KEY, "not json{{{");

    expect(loadProjects()).toEqual([]);
    expect(globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBe("not json{{{");
  });
});
