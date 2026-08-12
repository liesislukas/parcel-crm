"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AcquisitionPanel } from "@/components/crm/AcquisitionPanel";
import { PipelineTable } from "@/components/crm/PipelineTable";
import { RecordHistory } from "@/components/crm/RecordHistory";
import { RecordTasks } from "@/components/crm/RecordTasks";
import {
  ALL_STAGES,
  ENTITY_TYPE_LABEL,
  STAGE_LABEL,
  STAGE_ACTIVE_CLASS,
  STAGE_ORDER,
  entityKey,
  nextStep,
  type AcquisitionStage,
  type EntityType,
} from "@/lib/crm/acquisition";
import { useAcquisitionStore } from "@/lib/crm/useAcquisitionStore";

const PROVENANCE_NOTE =
  "Team roster, tasks, interest levels, asking prices and acquisition stages in this section are invented for this demo — this build has no authentication, no user accounts and no CRM back end. Owner names, parcel identifiers, acreages, assessed values and mailing addresses come from the Rock Island County GIS parcel layer, retrieved 2026-08-11.";

const RESET_CONFIRM =
  "Discard every acquisition record, task and history entry in this browser and restore the seeded demo data?";

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";
const CONTROL_CLASS =
  "rounded-md border border-black/20 bg-transparent px-2 py-1.5 text-sm dark:border-white/25";
const BADGE_CLASS = "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";

const VALID_TYPES: EntityType[] = ["owner", "parcel", "project"];

export function AcquisitionsWorkspace() {
  const api = useAcquisitionStore();
  const params = useSearchParams();
  // useSearchParams().get() returns the already-decoded value — never call
  // decodeURIComponent on it.
  const recordType = params.get("record");
  const recordId = params.get("id");
  const [stageFilter, setStageFilter] = useState<AcquisitionStage | "all">("all");

  const showRecord =
    recordType !== null &&
    (VALID_TYPES as string[]).includes(recordType) &&
    recordId !== null &&
    recordId !== "";

  return (
    <div data-testid="acquisitions-workspace" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Acquisitions</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Interest, asking price and acquisition stage for every owner, parcel and project in the
          pipeline.
        </p>
        <p
          data-testid="crm-provenance-note"
          className="max-w-3xl text-xs text-black/45 dark:text-white/45"
        >
          {PROVENANCE_NOTE}
        </p>
        <div>
          <button
            type="button"
            data-testid="reset-acquisition-demo"
            className={`${BUTTON_CLASS} mt-1`}
            onClick={() => {
              if (window.confirm(RESET_CONFIRM)) api.resetDemo();
            }}
          >
            Reset acquisition demo data
          </button>
        </div>
      </header>

      {!api.hydrated ? (
        <p className="text-xs text-black/45 dark:text-white/45">Loading CRM data…</p>
      ) : showRecord ? (
        <RecordView entityType={recordType as EntityType} entityId={recordId as string} api={api} />
      ) : (
        <PipelineView api={api} stageFilter={stageFilter} setStageFilter={setStageFilter} />
      )}
    </div>
  );
}

function RecordView({
  entityType,
  entityId,
  api,
}: {
  entityType: EntityType;
  entityId: string;
  api: ReturnType<typeof useAcquisitionStore>;
}) {
  const key = `${entityType}:${entityId}`;
  const record = api.store.records[key];

  if (!record) {
    return (
      <p data-testid="acquisition-record">
        {`No acquisition record for this ${ENTITY_TYPE_LABEL[entityType].toLowerCase()}. Open it from the Map section to start tracking it.`}{" "}
        <Link href="/acquisitions" className="underline-offset-2 hover:underline">
          Back to the pipeline
        </Link>
      </p>
    );
  }

  const tasks = api.store.tasks.filter((t) => entityKey(t.entity) === key);
  const events = api.store.events.filter((e) => e.entityKey === key);

  return (
    <article data-testid="acquisition-record" className="flex flex-col gap-5">
      <Link href="/acquisitions" className="text-sm underline-offset-2 hover:underline">
        ← Back to the pipeline
      </Link>

      <div>
        <span className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
          {ENTITY_TYPE_LABEL[entityType]}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <h1 data-testid="record-title" className="text-xl font-semibold">
            {record.entity.label}
          </h1>
          {record.seeded ? (
            <span
              className={`${BADGE_CLASS} bg-black/[.06] text-black/55 dark:bg-white/[.10] dark:text-white/55`}
              title="Seeded demo record — not entered by a user of this deployment"
            >
              SEEDED
            </span>
          ) : null}
        </div>
        <p data-testid="record-detail" className="text-sm text-black/60 dark:text-white/60">
          {record.entity.detail}
        </p>
      </div>

      <AcquisitionPanel
        record={record}
        hydrated={api.hydrated}
        onStageChange={(stage) => api.setStage(record.entity, stage, "You")}
        onSave={(interest, price) =>
          api.saveInterestAndPrice(record.entity, interest, price, "You")
        }
      />

      <RecordTasks
        tasks={tasks}
        today={api.today}
        hydrated={api.hydrated}
        onCreate={(input) => api.createTask({ entity: record.entity, ...input })}
        onComplete={api.completeTask}
        onReopen={api.reopenTask}
      />

      <RecordHistory events={events} hydrated={api.hydrated} />
    </article>
  );
}

function PipelineView({
  api,
  stageFilter,
  setStageFilter,
}: {
  api: ReturnType<typeof useAcquisitionStore>;
  stageFilter: AcquisitionStage | "all";
  setStageFilter: (next: AcquisitionStage | "all") => void;
}) {
  const allRecords = Object.values(api.store.records);
  const stageCounts = new Map<AcquisitionStage, number>();
  for (const stage of ALL_STAGES) stageCounts.set(stage, 0);
  for (const record of allRecords) {
    stageCounts.set(record.stage, (stageCounts.get(record.stage) ?? 0) + 1);
  }

  const filtered =
    stageFilter === "all" ? allRecords : allRecords.filter((r) => r.stage === stageFilter);

  const sorted = [...filtered].sort((a, b) => {
    const stageDiff = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
    if (stageDiff !== 0) return stageDiff;
    return a.entity.label.localeCompare(b.entity.label);
  });

  const rows = sorted.map((record) => {
    const key = entityKey(record.entity);
    const tasksForRecord = api.store.tasks.filter((t) => entityKey(t.entity) === key);
    return {
      record,
      openTaskCount: tasksForRecord.filter((t) => t.status === "open").length,
      next: nextStep(tasksForRecord),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Stage
          </span>
          <select
            data-testid="stage-filter"
            className={CONTROL_CLASS}
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as AcquisitionStage | "all")}
          >
            <option value="all">All stages</option>
            {ALL_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABEL[stage]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          {ALL_STAGES.map((stage) => (
            <span
              key={stage}
              data-testid="stage-chip"
              data-stage={stage}
              className={`${BADGE_CLASS} ${STAGE_ACTIVE_CLASS[stage]}`}
            >
              {STAGE_LABEL[stage]} {stageCounts.get(stage) ?? 0}
            </span>
          ))}
        </div>
      </div>

      <p data-testid="pipeline-count" className="text-sm text-black/60 dark:text-white/60">
        {rows.length} records shown
      </p>

      <PipelineTable rows={rows} today={api.today} />
    </div>
  );
}
