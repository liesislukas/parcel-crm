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

type ProjectsEnvelope = { version: 1; projects: Project[] };

function isProject(v: unknown): v is Project {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.name === "string" &&
    p.name.length > 0 &&
    Array.isArray(p.pins) &&
    p.pins.every((pin) => typeof pin === "string") &&
    typeof p.createdAt === "string" &&
    typeof p.updatedAt === "string"
  );
}

/**
 * Never throws and never clears the key on a parse failure — corrupt data is left alone
 * rather than destroyed. Returns `[]` for every failure mode: no `localStorage` (SSR), the
 * key absent, `JSON.parse` throwing, a non-object envelope, the wrong version, or a
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
  if (envelope.version !== 1) return [];
  if (!Array.isArray(envelope.projects)) return [];

  return envelope.projects.filter(isProject);
}

/** Any write failure (quota, private mode) is re-thrown as `STORAGE_UNAVAILABLE_MESSAGE`. */
function writeEnvelope(projects: Project[]): void {
  const envelope: ProjectsEnvelope = { version: 1, projects };
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

export function createProject(name: string, pins: readonly string[]): Project {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Project name is required");

  const dedupedPins = [...new Set(pins)];
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    name: trimmed,
    pins: dedupedPins,
    createdAt: now,
    updatedAt: now,
  };

  const projects = readEnvelope();
  projects.push(project);
  writeEnvelope(projects);
  return project;
}

export function replaceProjectPins(id: string, pins: readonly string[]): Project | null {
  const projects = readEnvelope();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const dedupedPins = [...new Set(pins)];
  const updated: Project = {
    ...projects[index],
    pins: dedupedPins,
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
