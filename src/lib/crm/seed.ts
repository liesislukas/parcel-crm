import {
  SEEDED_ACTOR,
  addDaysIso,
  entityKey,
  todayIso,
  type AcquisitionRecord,
  type AcquisitionStage,
  type ActivityEvent,
  type EntityRef,
  type InterestLevel,
  type Task,
} from "@/lib/crm/acquisition";
import { memberName } from "@/lib/crm/team";

export type SeedBundle = {
  records: Record<string, AcquisitionRecord>;
  tasks: Task[];
  events: ActivityEvent[];
};

/**
 * The 15 seeded acquisition records, in the plan's numbered order (index 0 === record #1).
 * Every owner/parcel identifier, acreage, EAV, and mailing address is copied verbatim from
 * `public/data/rock-island-parcels.json` — none of it is re-derived here. Every entity is
 * an institution, a government body, or a corporate owner; no private individual is seeded.
 */
const SEED_ENTITIES: EntityRef[] = [
  {
    type: "owner",
    id: "COLUMBIA BUSINESS PARK LLC",
    label: "COLUMBIA BUSINESS PARK LLC",
    detail: "2 parcels · 19.68 ac · mail 350 44TH ST, ROCK ISLAND IL 612012150",
  },
  {
    type: "owner",
    id: "MCRE 44 LLC",
    label: "MCRE 44 LLC",
    detail: "1 parcel · 26.28 ac · mail 2430 RIVER DR, MOLINE IL 612651564",
  },
  {
    type: "owner",
    id: "CRESTHILL PRESERV GRP LLC",
    label: "CRESTHILL PRESERV GRP LLC",
    detail: "1 parcel · 9.84 ac · mail PO BOX 194, MOLINE IL 612660194",
  },
  {
    type: "owner",
    id: "IOWA ILLINOIS GAS & ELECTRIC CO",
    label: "IOWA ILLINOIS GAS & ELECTRIC CO",
    detail:
      "5 parcels · 13.82 ac · tax bill MIDAMERICAN ENERGY CO · mail PO BOX 657TAX-DML4N, DES MOINES IA 503060657",
  },
  {
    type: "owner",
    id: "HURD ROCK ISLAND LLC",
    label: "HURD ROCK ISLAND LLC",
    detail:
      "1 parcel · 7.29 ac · tax bill HYVEE INC · mail 5820 WESTOWN PKWY, WEST DES MOINES IA 502668223",
  },
  {
    type: "owner",
    id: "SKV HOLDINGS INC",
    label: "SKV HOLDINGS INC",
    detail: "37 parcels · 7.41 ac · mail 926 W 3RD ST, DAVENPORT IA 52802",
  },
  {
    type: "owner",
    id: "WINDMILL FARM INVESTMENTS LLC",
    label: "WINDMILL FARM INVESTMENTS LLC",
    detail: "24 parcels · 3.58 ac · mail PO BOX 1562, MILAN IL 612641562",
  },
  {
    type: "owner",
    id: "CITY OF ROCK ISLAND",
    label: "CITY OF ROCK ISLAND",
    detail: "65 parcels · 181.58 ac · mail 1528 3RD AVE, ROCK ISLAND IL 612018612",
  },
  {
    type: "owner",
    id: "LRC REAL ESTATE INC",
    label: "LRC REAL ESTATE INC",
    detail: "9 parcels · 6.95 ac · mail 500 42ND ST STE 2, ROCK ISLAND IL 612012155",
  },
  {
    type: "owner",
    id: "AMRA HOMES INC",
    label: "AMRA HOMES INC",
    detail: "3 parcels · 5.80 ac · mail 2316 5TH AVE, MOLINE IL 612651530",
  },
  {
    type: "owner",
    id: "ROCK ISLAND ARSENAL",
    label: "ROCK ISLAND ARSENAL",
    detail: "1 parcel · 975.69 ac · EAV $0 · no mailing address in the county source",
  },
  {
    type: "parcel",
    id: "0831108001",
    label: "PIN 0831108001",
    detail: "26.28 ac · EAV $2,784,937 · MCRE 44 LLC",
  },
  {
    type: "parcel",
    id: "0831108002",
    label: "PIN 0831108002",
    detail: "10.56 ac · EAV $109,465 · COLUMBIA BUSINESS PARK LLC",
  },
  {
    type: "parcel",
    id: "0736101015",
    label: "PIN 0736101015",
    detail: "11.25 ac · EAV $3,977,168 · IOWA ILLINOIS GAS & ELECTRIC CO",
  },
  {
    type: "project",
    id: "columbia-business-park",
    label: "Columbia Business Park Assemblage",
    detail:
      "3 parcels (0831108001, 0831108002, 0831108003) · 45.97 ac combined · seeded example project",
  },
];

type RecordSeed = {
  stage: AcquisitionStage;
  interest: InterestLevel;
  askingPriceUsd: number | null;
  updatedOffset: number;
};

/** Aligned index-for-index with `SEED_ENTITIES`. */
const RECORD_SEEDS: RecordSeed[] = [
  { stage: "negotiating", interest: "motivated", askingPriceUsd: 2400000, updatedOffset: -1 },
  { stage: "contacted", interest: "interested", askingPriceUsd: 3950000, updatedOffset: -3 },
  { stage: "contacted", interest: "passive", askingPriceUsd: null, updatedOffset: -5 },
  { stage: "not-contacted", interest: "unknown", askingPriceUsd: null, updatedOffset: -7 },
  { stage: "not-contacted", interest: "unknown", askingPriceUsd: null, updatedOffset: -7 },
  { stage: "contacted", interest: "not-interested", askingPriceUsd: null, updatedOffset: -4 },
  { stage: "negotiating", interest: "interested", askingPriceUsd: 890000, updatedOffset: -2 },
  { stage: "contacted", interest: "passive", askingPriceUsd: null, updatedOffset: -6 },
  { stage: "under-contract", interest: "motivated", askingPriceUsd: 1750000, updatedOffset: -1 },
  { stage: "closed-won", interest: "motivated", askingPriceUsd: 640000, updatedOffset: -9 },
  { stage: "closed-lost", interest: "not-interested", askingPriceUsd: null, updatedOffset: -8 },
  { stage: "contacted", interest: "interested", askingPriceUsd: 3950000, updatedOffset: -3 },
  { stage: "negotiating", interest: "motivated", askingPriceUsd: 1250000, updatedOffset: -1 },
  { stage: "not-contacted", interest: "unknown", askingPriceUsd: null, updatedOffset: -7 },
  { stage: "negotiating", interest: "motivated", askingPriceUsd: 5200000, updatedOffset: -1 },
];

type TaskSeed = {
  id: string;
  title: string;
  assigneeId: string;
  entityIndex: number; // 0-based into SEED_ENTITIES
  dueOffset: number;
  createdOffset: number;
  status: "open" | "done";
};

const TASK_SEEDS: TaskSeed[] = [
  {
    id: "task-seed-01",
    title: "Send follow-up LOI to Columbia Business Park LLC",
    assigneeId: "tm-avery-cole",
    entityIndex: 0,
    dueOffset: 2,
    createdOffset: -4,
    status: "open",
  },
  {
    id: "task-seed-02",
    title: "Confirm asking price with Columbia Business Park LLC",
    assigneeId: "tm-jordan-pike",
    entityIndex: 0,
    dueOffset: -1,
    createdOffset: -6,
    status: "open",
  },
  {
    id: "task-seed-03",
    title: "Order title search on PIN 0831108002",
    assigneeId: "tm-riley-nunez",
    entityIndex: 12,
    dueOffset: 5,
    createdOffset: -2,
    status: "open",
  },
  {
    id: "task-seed-04",
    title: "Log initial call with MCRE 44 LLC",
    assigneeId: "tm-sam-okafor",
    entityIndex: 1,
    dueOffset: -6,
    createdOffset: -9,
    status: "done",
  },
  {
    id: "task-seed-05",
    title: "Draft purchase terms for PIN 0831108001",
    assigneeId: "tm-avery-cole",
    entityIndex: 11,
    dueOffset: 7,
    createdOffset: -1,
    status: "open",
  },
  {
    id: "task-seed-06",
    title: "Request interconnection queue position from MidAmerican Energy",
    assigneeId: "tm-devin-shah",
    entityIndex: 3,
    dueOffset: 3,
    createdOffset: -3,
    status: "open",
  },
  {
    id: "task-seed-07",
    title: "First-contact letter to Cresthill Preserv Grp LLC",
    assigneeId: "tm-sam-okafor",
    entityIndex: 2,
    dueOffset: 0,
    createdOffset: -5,
    status: "open",
  },
  {
    id: "task-seed-08",
    title: "Verify parcel 0736101015 substation setback",
    assigneeId: "tm-devin-shah",
    entityIndex: 13,
    dueOffset: 9,
    createdOffset: -2,
    status: "open",
  },
  {
    id: "task-seed-09",
    title: "Close out SKV Holdings Inc — owner declined",
    assigneeId: "tm-jordan-pike",
    entityIndex: 5,
    dueOffset: -3,
    createdOffset: -8,
    status: "done",
  },
  {
    id: "task-seed-10",
    title: "Negotiate option period with Windmill Farm Investments LLC",
    assigneeId: "tm-avery-cole",
    entityIndex: 6,
    dueOffset: 4,
    createdOffset: -3,
    status: "open",
  },
  {
    id: "task-seed-11",
    title: "Prepare City of Rock Island council briefing",
    assigneeId: "tm-jordan-pike",
    entityIndex: 7,
    dueOffset: 12,
    createdOffset: -2,
    status: "open",
  },
  {
    id: "task-seed-12",
    title: "Confirm Rock Island Arsenal is federal land and mark closed-lost",
    assigneeId: "tm-riley-nunez",
    entityIndex: 10,
    dueOffset: -8,
    createdOffset: -11,
    status: "done",
  },
  {
    id: "task-seed-13",
    title: "Combined acreage check for Columbia Business Park Assemblage",
    assigneeId: "tm-devin-shah",
    entityIndex: 14,
    dueOffset: 1,
    createdOffset: -4,
    status: "open",
  },
  {
    id: "task-seed-14",
    title: "Circulate assemblage plat to legal",
    assigneeId: "tm-riley-nunez",
    entityIndex: 14,
    dueOffset: 6,
    createdOffset: -2,
    status: "open",
  },
  {
    id: "task-seed-15",
    title: "Open escrow for LRC Real Estate Inc",
    assigneeId: "tm-riley-nunez",
    entityIndex: 8,
    dueOffset: 8,
    createdOffset: -1,
    status: "open",
  },
  {
    id: "task-seed-16",
    title: "Record deed for Amra Homes Inc purchase",
    assigneeId: "tm-riley-nunez",
    entityIndex: 9,
    dueOffset: -10,
    createdOffset: -14,
    status: "done",
  },
  {
    id: "task-seed-17",
    title: "Second outreach attempt to Hurd Rock Island LLC",
    assigneeId: "tm-sam-okafor",
    entityIndex: 4,
    dueOffset: 2,
    createdOffset: -3,
    status: "open",
  },
  {
    id: "task-seed-18",
    title: "Survey quote for PIN 0831108001",
    assigneeId: "tm-devin-shah",
    entityIndex: 11,
    dueOffset: -2,
    createdOffset: -7,
    status: "open",
  },
];

/** Explicit stage-changed events not implied by a task. `actor` is always `SEEDED_ACTOR`. */
const STAGE_EVENT_SEEDS: {
  id: string;
  entityIndex: number;
  atOffset: number;
  summary: string;
}[] = [
  {
    id: "evt-seed-stage-1",
    entityIndex: 0,
    atOffset: -1,
    summary: "Stage changed from Contacted to Negotiating.",
  },
  {
    id: "evt-seed-stage-9",
    entityIndex: 8,
    atOffset: -1,
    summary: "Stage changed from Negotiating to Under contract.",
  },
  {
    id: "evt-seed-stage-11",
    entityIndex: 10,
    atOffset: -8,
    summary: "Stage changed from Not contacted to Closed — lost.",
  },
];

export function buildSeed(today: string = todayIso()): SeedBundle {
  const records: Record<string, AcquisitionRecord> = {};
  SEED_ENTITIES.forEach((entity, i) => {
    const seed = RECORD_SEEDS[i];
    records[entityKey(entity)] = {
      entity,
      stage: seed.stage,
      interest: seed.interest,
      askingPriceUsd: seed.askingPriceUsd,
      updatedAt: `${addDaysIso(today, seed.updatedOffset)}T12:00:00.000Z`,
      seeded: true,
    };
  });

  const tasks: Task[] = TASK_SEEDS.map((t) => {
    const entity = SEED_ENTITIES[t.entityIndex];
    const dueDate = addDaysIso(today, t.dueOffset);
    const createdAt = `${addDaysIso(today, t.createdOffset)}T09:00:00.000Z`;
    const completedAt = t.status === "done" ? `${dueDate}T15:00:00.000Z` : null;
    return {
      id: t.id,
      title: t.title,
      assigneeId: t.assigneeId,
      entity,
      dueDate,
      status: t.status,
      createdAt,
      completedAt,
      seeded: true,
    };
  });

  const events: ActivityEvent[] = [];

  for (const t of TASK_SEEDS) {
    const entity = SEED_ENTITIES[t.entityIndex];
    const dueDate = addDaysIso(today, t.dueOffset);
    const createdAt = `${addDaysIso(today, t.createdOffset)}T09:00:00.000Z`;
    events.push({
      id: `evt-created-${t.id}`,
      entityKey: entityKey(entity),
      at: createdAt,
      actor: memberName(t.assigneeId),
      kind: "task-created",
      summary: `Task assigned to ${memberName(t.assigneeId)}: ${t.title}`,
      seeded: true,
    });
    if (t.status === "done") {
      const completedAt = `${dueDate}T15:00:00.000Z`;
      events.push({
        id: `evt-completed-${t.id}`,
        entityKey: entityKey(entity),
        at: completedAt,
        actor: memberName(t.assigneeId),
        kind: "task-completed",
        summary: `Task completed: ${t.title}`,
        seeded: true,
      });
    }
  }

  for (const s of STAGE_EVENT_SEEDS) {
    const entity = SEED_ENTITIES[s.entityIndex];
    events.push({
      id: s.id,
      entityKey: entityKey(entity),
      at: `${addDaysIso(today, s.atOffset)}T12:00:00.000Z`,
      actor: SEEDED_ACTOR,
      kind: "stage-changed",
      summary: s.summary,
      seeded: true,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return { records, tasks, events };
}
