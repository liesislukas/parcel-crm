/**
 * The acquisition domain model: entity linking, the acquisition-stage and interest
 * vocabularies, tasks, activity events, and the pure date arithmetic they depend on.
 *
 * No React, no JSX, no DOM API, no `localStorage` here — this module runs under
 * `environment: "node"` in vitest and must stay that way.
 */

export type EntityType = "owner" | "parcel" | "project";
export type EntityRef = { type: EntityType; id: string; label: string; detail: string };

export type AcquisitionStage =
  "not-contacted" | "contacted" | "negotiating" | "under-contract" | "closed-won" | "closed-lost";

export type InterestLevel = "unknown" | "not-interested" | "passive" | "interested" | "motivated";

export type TaskStatus = "open" | "done";

export type DueState = "overdue" | "today" | "upcoming";

export type ActivityKind =
  | "stage-changed"
  | "interest-changed"
  | "asking-price-changed"
  | "task-created"
  | "task-completed"
  | "task-reopened";

export type AcquisitionRecord = {
  entity: EntityRef;
  stage: AcquisitionStage;
  interest: InterestLevel;
  askingPriceUsd: number | null; // null === not recorded. NEVER 0 as a stand-in
  updatedAt: string; // ISO 8601
  seeded: boolean;
};

export type Task = {
  id: string;
  title: string;
  assigneeId: string; // a TeamMember.id from @/lib/crm/team
  entity: EntityRef;
  dueDate: string; // "YYYY-MM-DD"
  status: TaskStatus;
  createdAt: string; // ISO 8601
  completedAt: string | null; // ISO 8601 when status === "done", else null
  seeded: boolean;
};

export type ActivityEvent = {
  id: string;
  entityKey: string;
  at: string; // ISO 8601
  actor: string; // team member name, or SEEDED_ACTOR
  kind: ActivityKind;
  summary: string;
  seeded: boolean;
};

export const SEEDED_ACTOR = "Seeded demo data";

export const STAGE_ORDER: AcquisitionStage[] = [
  "not-contacted",
  "contacted",
  "negotiating",
  "under-contract",
  "closed-won",
];
export const TERMINAL_LOST: AcquisitionStage = "closed-lost";
export const ALL_STAGES: AcquisitionStage[] = [...STAGE_ORDER, TERMINAL_LOST];

export const STAGE_LABEL: Record<AcquisitionStage, string> = {
  "not-contacted": "Not contacted",
  contacted: "Contacted",
  negotiating: "Negotiating",
  "under-contract": "Under contract",
  "closed-won": "Closed — won",
  "closed-lost": "Closed — lost",
};

export const STAGE_ACTIVE_CLASS: Record<AcquisitionStage, string> = {
  "not-contacted": "bg-black/10 text-black dark:bg-white/20 dark:text-white",
  contacted: "bg-blue-600 text-white",
  negotiating: "bg-amber-500 text-white",
  "under-contract": "bg-violet-600 text-white",
  "closed-won": "bg-emerald-600 text-white",
  "closed-lost": "bg-rose-600 text-white",
};

export const STAGE_INACTIVE_CLASS =
  "bg-transparent text-black/60 ring-1 ring-inset ring-black/15 hover:bg-black/[.04] dark:text-white/60 dark:ring-white/20 dark:hover:bg-white/[.06]";

export const ALL_INTERESTS: InterestLevel[] = [
  "unknown",
  "not-interested",
  "passive",
  "interested",
  "motivated",
];

export const INTEREST_LABEL: Record<InterestLevel, string> = {
  unknown: "Unknown",
  "not-interested": "Not interested",
  passive: "Passive",
  interested: "Interested",
  motivated: "Motivated seller",
};

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  owner: "Owner",
  parcel: "Parcel",
  project: "Project",
};

export const ASKING_PRICE_UNSET = "No asking price recorded";

export function entityKey(ref: Pick<EntityRef, "type" | "id">): string {
  return `${ref.type}:${ref.id}`;
}

export function defaultRecord(entity: EntityRef, now: string): AcquisitionRecord {
  return {
    entity,
    stage: "not-contacted",
    interest: "unknown",
    askingPriceUsd: null,
    updatedAt: now,
    seeded: false,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local date, "YYYY-MM-DD". Never `toISOString()` — that rolls forward west of UTC. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

/** `YYYY-MM-DD` sorts lexicographically the same as chronologically, so string compare suffices. */
export function dueState(dueDate: string, today: string): DueState {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "upcoming";
}

export function dueStateLabel(state: DueState): string {
  if (state === "overdue") return "overdue";
  if (state === "today") return "due today";
  return "upcoming";
}

/** Earliest-due open task, tie-broken by earliest `createdAt`. Never mutates the input. */
export function nextStep(tasks: Task[]): Task | null {
  const open = tasks.filter((t) => t.status === "open");
  if (open.length === 0) return null;
  const sorted = [...open].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return 0;
  });
  return sorted[0] ?? null;
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
