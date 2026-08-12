"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ENTITY_TYPE_LABEL,
  dueState,
  dueStateLabel,
  type Task,
  type TaskStatus,
} from "@/lib/crm/acquisition";
import { TEAM_MEMBERS, TEAM_ROSTER_NOTE, memberName } from "@/lib/crm/team";
import { useAcquisitionStore } from "@/lib/crm/useAcquisitionStore";

const PROVENANCE_NOTE =
  "Team roster, tasks, interest levels, asking prices and acquisition stages in this section are invented for this demo — this build has no authentication, no user accounts and no CRM back end. Owner names, parcel identifiers, acreages, assessed values and mailing addresses come from the Rock Island County GIS parcel layer, retrieved 2026-08-11.";

const CONTROL_CLASS =
  "rounded-md border border-black/20 bg-transparent px-2 py-1.5 text-sm dark:border-white/25";
const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";
const BADGE_CLASS = "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
const TH_CLASS =
  "border-b border-black/10 py-2 pr-3 text-xs font-medium tracking-wide text-black/55 uppercase dark:border-white/15 dark:text-white/55";
const TD_CLASS = "border-b border-black/5 py-2 pr-3 align-top dark:border-white/10";

function dueChipClass(state: ReturnType<typeof dueState>): string {
  if (state === "overdue") return `${BADGE_CLASS} bg-rose-600/15 text-rose-700 dark:text-rose-300`;
  if (state === "today") return `${BADGE_CLASS} bg-amber-500/20 text-amber-700 dark:text-amber-300`;
  return `${BADGE_CLASS} bg-black/[.06] text-black/60 dark:bg-white/[.10] dark:text-white/60`;
}

type StatusFilter = TaskStatus | "all";

export function TasksWorkspace() {
  const api = useAcquisitionStore();

  return (
    <div data-testid="tasks-workspace" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Acquisition tasks and next steps assigned to team members against an owner, parcel, or
          project.
        </p>
        <p
          data-testid="crm-provenance-note"
          className="max-w-3xl text-xs text-black/45 dark:text-white/45"
        >
          {PROVENANCE_NOTE}
        </p>
      </header>

      {!api.hydrated ? (
        <p className="text-xs text-black/45 dark:text-white/45">Loading CRM data…</p>
      ) : (
        <TasksWorkspaceBody api={api} />
      )}
    </div>
  );
}

function TasksWorkspaceBody({ api }: { api: ReturnType<typeof useAcquisitionStore> }) {
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");

  const openCountByAssignee = new Map<string, number>();
  for (const t of api.store.tasks) {
    if (t.status === "open") {
      openCountByAssignee.set(t.assigneeId, (openCountByAssignee.get(t.assigneeId) ?? 0) + 1);
    }
  }

  let filtered = api.store.tasks;
  if (assigneeFilter !== "all") {
    filtered = filtered.filter((t) => t.assigneeId === assigneeFilter);
  }
  if (statusFilter !== "all") {
    filtered = filtered.filter((t) => t.status === statusFilter);
  }

  const open = filtered
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const done = filtered
    .filter((t) => t.status === "done")
    .sort((a, b) => {
      const aAt = a.completedAt ?? "";
      const bAt = b.completedAt ?? "";
      return aAt < bAt ? 1 : aAt > bAt ? -1 : 0;
    });
  const rows: Task[] = [...open, ...done];

  return (
    <>
      <p className="text-xs text-black/45 dark:text-white/45">{TEAM_ROSTER_NOTE}</p>

      <ul data-testid="roster-strip" className="flex flex-wrap gap-3">
        {TEAM_MEMBERS.map((m) => (
          <li
            key={m.id}
            data-testid="roster-member"
            data-member-id={m.id}
            className="flex items-center gap-2 rounded-lg border border-black/10 p-2 text-sm dark:border-white/15"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[.07] text-xs font-semibold dark:bg-white/[.12]">
              {m.initials}
            </span>
            <span>
              <span className="block font-medium">{m.name}</span>
              <span className="block text-xs text-black/45 dark:text-white/45">{m.role}</span>
            </span>
            <span className="text-black/60 dark:text-white/60">
              {openCountByAssignee.get(m.id) ?? 0} open
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Assignee
          </span>
          <select
            data-testid="assignee-filter"
            className={CONTROL_CLASS}
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">All assignees</option>
            {TEAM_MEMBERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.role}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Status
          </span>
          <select
            data-testid="status-filter"
            className={CONTROL_CLASS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      <p data-testid="task-count" className="text-sm text-black/60 dark:text-white/60">
        {rows.length} tasks shown
      </p>

      {rows.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No tasks match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="tasks-table" className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className={TH_CLASS}>Task</th>
                <th className={TH_CLASS}>Record</th>
                <th className={TH_CLASS}>Assignee</th>
                <th className={TH_CLASS}>Due</th>
                <th className={TH_CLASS}>Status</th>
                <th className={TH_CLASS}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => {
                const state = dueState(task.dueDate, api.today);
                const href = `/acquisitions?record=${task.entity.type}&id=${encodeURIComponent(task.entity.id)}`;
                return (
                  <tr
                    key={task.id}
                    data-testid="task-row"
                    data-task-id={task.id}
                    data-assignee-id={task.assigneeId}
                  >
                    <td className={TD_CLASS}>{task.title}</td>
                    <td className={TD_CLASS}>
                      <Link href={href} className="underline-offset-2 hover:underline">
                        {ENTITY_TYPE_LABEL[task.entity.type]}: {task.entity.label}
                      </Link>
                    </td>
                    <td className={TD_CLASS}>{memberName(task.assigneeId)}</td>
                    <td className={TD_CLASS}>
                      {task.dueDate}{" "}
                      <span className={dueChipClass(state)}>{dueStateLabel(state)}</span>
                    </td>
                    <td className={TD_CLASS}>
                      <span className={BADGE_CLASS}>
                        {task.status === "done" ? "Done" : "Open"}
                      </span>
                    </td>
                    <td className={TD_CLASS}>
                      {task.status === "open" ? (
                        <button
                          type="button"
                          data-testid="complete-task"
                          data-task-id={task.id}
                          className={BUTTON_CLASS}
                          onClick={() => api.completeTask(task.id)}
                        >
                          Complete
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid="reopen-task"
                          data-task-id={task.id}
                          className={BUTTON_CLASS}
                          onClick={() => api.reopenTask(task.id)}
                        >
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
