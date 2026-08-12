import { beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@/lib/project";
import {
  PROJECTS_STORAGE_KEY,
  addProjectsIfAbsent,
  clearProjects,
  createProject,
  deleteProject,
  findProject,
  loadProjects,
  replaceProjectParcelIds,
  resolveProjectParcelIds,
  seedProjects,
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

  it("creates a project with deduplicated parcel ids and persists it across a reload", () => {
    const created = createProject("North Assemblage", ["A", "B", "A"]);

    expect(created.parcelIds).toEqual(["A", "B"]);
    expect(created.pins).toBeUndefined();
    expect(created.id).not.toBe("");

    const reloaded = loadProjects();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe(created.id);
    expect(reloaded[0].parcelIds).toEqual(["A", "B"]);
  });

  it("throws when the trimmed name is empty", () => {
    expect(() => createProject("   ", ["A"])).toThrowError("Project name is required");
  });

  it("replaces parcel ids and bumps updatedAt; an unknown id returns null", () => {
    const created = createProject("Assemblage", ["A", "B"]);
    const updated = replaceProjectParcelIds(created.id, ["A", "C"]);

    expect(updated).not.toBeNull();
    expect(updated!.parcelIds).toEqual(["A", "C"]);
    expect(updated!.updatedAt >= created.updatedAt).toBe(true);

    expect(replaceProjectParcelIds("does-not-exist", ["A"])).toBeNull();
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

  it("reads a v1 envelope saved by PIN and resolves its members through idsByPin", () => {
    // A project saved before ISSUE-013 carries `pins`, not `parcelIds`. It must survive
    // validation, keep its pins, and resolve to ids on read — never be silently dropped.
    globalThis.localStorage.setItem(
      PROJECTS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: "legacy-1",
            name: "Saved last week",
            pins: ["0736343005", "USA"],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const projects = loadProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].pins).toEqual(["0736343005", "USA"]);
    expect(projects[0].parcelIds).toBeUndefined();

    const idsByPin = new Map([
      ["0736343005", ["803"]],
      // "USA" is filed against 87 county records; a v1 project could not distinguish them.
      ["USA", ["1001", "1002"]],
    ]);
    expect(resolveProjectParcelIds(projects[0], idsByPin)).toEqual(["803", "1001", "1002"]);
  });

  it("round-trips a v2 envelope and prefers parcelIds over any legacy pins", () => {
    const created = createProject("Assemblage", ["11", "12"]);
    const stored = JSON.parse(globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY)!);

    expect(stored.version).toBe(2);
    expect(stored.projects[0].parcelIds).toEqual(["11", "12"]);
    expect(resolveProjectParcelIds(created, new Map())).toEqual(["11", "12"]);
  });

  it("drops a legacy pin that resolves to nothing rather than inventing an id", () => {
    const project = {
      id: "legacy-2",
      name: "Half resolvable",
      parcelIds: [],
      pins: ["KNOWN", "GONE"],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };

    expect(resolveProjectParcelIds(project, new Map([["KNOWN", ["7"]]]))).toEqual(["7"]);
  });

  it("returns [] for garbage stored data and leaves the raw value untouched", () => {
    globalThis.localStorage.setItem(PROJECTS_STORAGE_KEY, "not json{{{");

    expect(loadProjects()).toEqual([]);
    expect(globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBe("not json{{{");
  });
});

const seedFixtures: Project[] = [
  {
    id: "seed-a",
    name: "Seed A",
    parcelIds: ["1", "2"],
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    seeded: true,
  },
  {
    id: "seed-b",
    name: "Seed B",
    parcelIds: ["3"],
    createdAt: "2026-08-06T09:00:00.000Z",
    updatedAt: "2026-08-06T09:00:00.000Z",
    seeded: true,
  },
];

describe("seedProjects", () => {
  it("returns true and stores both projects when the key is absent", () => {
    expect(seedProjects(seedFixtures)).toBe(true);
    expect(loadProjects()).toEqual(seedFixtures);
  });

  it("called a second time returns false and leaves the stored value byte-identical", () => {
    seedProjects(seedFixtures);
    const before = globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY);

    expect(seedProjects(seedFixtures)).toBe(false);
    expect(globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBe(before);
  });

  it("when a user project was created first, returns false and the user project is still the only entry", () => {
    createProject("User's own project", ["9"]);

    expect(seedProjects(seedFixtures)).toBe(false);
    const stored = loadProjects();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("User's own project");
  });
});

describe("clearProjects", () => {
  it("leaves loadProjects() empty and writes a present, empty v2 envelope", () => {
    createProject("Something", ["1"]);

    clearProjects();

    expect(loadProjects()).toEqual([]);
    expect(globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY)).toBe(
      '{"version":2,"projects":[]}',
    );
  });
});

describe("addProjectsIfAbsent", () => {
  it("adds only the missing ids and returns the count", () => {
    seedProjects([seedFixtures[0]]);

    const added = addProjectsIfAbsent(seedFixtures);

    expect(added).toBe(1);
    expect(loadProjects().map((p) => p.id)).toEqual(["seed-a", "seed-b"]);
  });

  it("adds nothing and returns 0 when every id is already present", () => {
    seedProjects(seedFixtures);

    expect(addProjectsIfAbsent(seedFixtures)).toBe(0);
    expect(loadProjects()).toHaveLength(2);
  });
});
