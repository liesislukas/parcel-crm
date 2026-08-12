import type { Project } from "@/lib/project";

/**
 * Persistence — decided and recorded as fact.
 *
 * Projects are stored in the browser's `localStorage` under the key
 * `parcel-crm.projects.v1`.
 *
 * Why, recorded so no later issue re-litigates it: the repo has no database and the Vercel
 * project has no storage integration provisioned; adding Neon/Blob would need account
 * provisioning and a `DATABASE_URL` this plan cannot verify exists, which would block the
 * board on a user decision for a criterion that only requires a project to survive a reload.
 * `localStorage` satisfies AC4 exactly, needs no env var, and cannot break the deployed
 * build. All access goes through this one repository module, so a later issue can swap the
 * backend without touching any component. The limitation is stated in the UI verbatim — a
 * stated gap, not a silent one.
 */
export const PROJECTS_STORAGE_KEY = "parcel-crm.projects.v1";

export const STORAGE_UNAVAILABLE_MESSAGE =
  "Could not save in this browser — storage is unavailable (private window or full quota). The project was not saved.";

/**
 * The storage KEY does not change with the envelope version. Changing it would orphan every
 * project saved before ISSUE-013; instead v2 writes `parcelIds` and reads still accept a v1
 * envelope, whose `pins` are resolved to ids at read time by `resolveProjectParcelIds`.
 */
type ProjectsEnvelope = { version: 2; projects: Project[] };

function isProject(v: unknown): v is Project {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  const stringArray = (v: unknown): boolean =>
    Array.isArray(v) && v.every((entry) => typeof entry === "string");
  // Either shape is valid: v2 records carry `parcelIds`, v1 records carry `pins`. A v1 record
  // that failed validation here would be silently dropped, losing a user's saved project.
  const hasMembers = stringArray(p.parcelIds) || stringArray(p.pins);
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.name === "string" &&
    p.name.length > 0 &&
    hasMembers &&
    typeof p.createdAt === "string" &&
    typeof p.updatedAt === "string"
  );
}

/**
 * Never throws and never clears the key on a parse failure — corrupt data is left alone
 * rather than destroyed. Returns `[]` for every failure mode: no `localStorage` (SSR), the
 * key absent, `JSON.parse` throwing, a non-object envelope, an unrecognised version, or a
 * non-array `projects`. Per-entry validation drops individual malformed projects rather than
 * discarding the whole list.
 */
function readEnvelope(): Project[] {
  if (typeof globalThis.localStorage === "undefined") return [];
  const raw = globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];
  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== 2 && envelope.version !== 1) return [];
  if (!Array.isArray(envelope.projects)) return [];

  return envelope.projects.filter(isProject);
}

/** Any write failure (quota, private mode) is re-thrown as `STORAGE_UNAVAILABLE_MESSAGE`. */
function writeEnvelope(projects: Project[]): void {
  const envelope: ProjectsEnvelope = { version: 2, projects };
  try {
    globalThis.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    throw new Error(STORAGE_UNAVAILABLE_MESSAGE);
  }
}

/** Returns projects in stored order, which is creation order. */
export function loadProjects(): Project[] {
  return readEnvelope();
}

export function findProject(id: string): Project | null {
  return readEnvelope().find((p) => p.id === id) ?? null;
}

export function createProject(name: string, parcelIds: readonly string[]): Project {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Project name is required");

  const deduped = [...new Set(parcelIds)];
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    name: trimmed,
    parcelIds: deduped,
    createdAt: now,
    updatedAt: now,
  };

  const projects = readEnvelope();
  projects.push(project);
  writeEnvelope(projects);
  return project;
}

export function replaceProjectParcelIds(id: string, parcelIds: readonly string[]): Project | null {
  const projects = readEnvelope();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const deduped = [...new Set(parcelIds)];
  const updated: Project = {
    ...projects[index],
    parcelIds: deduped,
    updatedAt: new Date().toISOString(),
  };
  projects[index] = updated;
  writeEnvelope(projects);
  return updated;
}

export function deleteProject(id: string): void {
  const projects = readEnvelope().filter((p) => p.id !== id);
  writeEnvelope(projects);
}

/**
 * Installs the demo-seed projects only when the storage key is entirely absent — never when
 * it already holds a value, seeded or not, empty or not. That is what makes the seed pass
 * idempotent and never clobber a project a user (or a prior seed pass) already created.
 * Returns `false` and writes nothing when `localStorage` is unavailable or the key exists;
 * otherwise writes the v2 envelope and returns `true`.
 */
export function seedProjects(projects: readonly Project[]): boolean {
  if (typeof globalThis.localStorage === "undefined") return false;
  if (globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY) !== null) return false;
  writeEnvelope([...projects]);
  return true;
}

/**
 * Resets to a present, explicitly EMPTY envelope — it writes `{ version: 2, projects: [] }`,
 * it never `removeItem`s the key. An absent key means "never seeded"; a present empty
 * envelope means "deliberately cleared", which is what keeps a reload from re-seeding.
 */
export function clearProjects(): void {
  writeEnvelope([]);
}

/**
 * Adds only the projects whose `id` is not already present, in the input's order, and never
 * mutates an existing entry. Returns how many were added. Used by the demo-data restore
 * control: it can re-add the seeded rows without touching anything a user made.
 */
export function addProjectsIfAbsent(projects: readonly Project[]): number {
  const current = readEnvelope();
  const existingIds = new Set(current.map((p) => p.id));
  const toAdd = projects.filter((p) => !existingIds.has(p.id));
  if (toAdd.length === 0) return 0;
  writeEnvelope([...current, ...toAdd]);
  return toAdd.length;
}

/**
 * The single migration point between v1 projects (saved by PIN) and the id-keyed model.
 *
 * A v1 pin that matches several records contributes ALL of them: a v1 project could not
 * distinguish the 29 colliding PIN values, and dropping records would understate the
 * project's acreage. A pin with no match contributes nothing and surfaces through
 * `ProjectStats.missingIds`. The migration is computed on read and never persisted, so a
 * stored project is never rewritten behind the user's back.
 */
export function resolveProjectParcelIds(
  project: Project,
  idsByPin: ReadonlyMap<string, string[]>,
): string[] {
  if (Array.isArray(project.parcelIds) && project.parcelIds.length > 0) {
    return project.parcelIds;
  }

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const pin of project.pins ?? []) {
    for (const id of idsByPin.get(pin) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      resolved.push(id);
    }
  }
  return resolved;
}
