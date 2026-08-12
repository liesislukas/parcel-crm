"use client";

import { useState } from "react";
import { dueState, dueStateLabel, nextStep, type Task } from "@/lib/crm/acquisition";
import { TEAM_MEMBERS, memberName } from "@/lib/crm/team";

const PANEL_CLASS = "rounded-lg border border-black/10 p-4 text-sm dark:border-white/15";
const LABEL_CLASS = "text-xs tracking-wide text-black/55 uppercase dark:text-white/55";
const CONTROL_CLASS =
  "rounded-md border border-black/20 bg-transparent px-2 py-1.5 text-sm dark:border-white/25";
const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";
const BADGE_CLASS = "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
const SEEDED_BADGE_CLASS = `${BADGE_CLASS} bg-black/[.06] text-black/55 dark:bg-white/[.10] dark:text-white/55`;
const SEEDED_BADGE_TITLE = "Seeded demo record — not entered by a user of this deployment";

function dueChipClass(state: ReturnType<typeof dueState>): string {
  if (state === "overdue") return `${BADGE_CLASS} bg-rose-600/15 text-rose-700 dark:text-rose-300`;
  if (state === "today") return `${BADGE_CLASS} bg-amber-500/20 text-amber-700 dark:text-amber-300`;
  return `${BADGE_CLASS} bg-black/[.06] text-black/60 dark:bg-white/[.10] dark:text-white/60`;
}

type Props = {
  tasks: Task[]; // already filtered to this record's entityKey by the caller
  today: string;
  hydrated: boolean;
  onCreate: (input: { title: string; assigneeId: string; dueDate: string }) => void;
  onComplete: (taskId: string) => void;
  onReopen: (taskId: string) => void;
};

export function RecordTasks(props: Props) {
  if (!props.hydrated) {
    return <p className="text-xs text-black/45 dark:text-white/45">Loading CRM data…</p>;
  }
  return <RecordTasksBody {...props} />;
}

function RecordTasksBody({ tasks, today, onCreate, onComplete, onReopen }: Props) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState(TEAM_MEMBERS[0].id);
  const [dueDate, setDueDate] = useState(today);

  const ns = nextStep(tasks);
  const openTasks = tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const doneTasks = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => {
      const aAt = a.completedAt ?? "";
      const bAt = b.completedAt ?? "";
      return aAt < bAt ? 1 : aAt > bAt ? -1 : 0;
    });
  const ordered = [...openTasks, ...doneTasks];

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "") return;
    onCreate({ title: trimmed, assigneeId, dueDate });
    setTitle("");
  }

  return (
    <section data-testid="record-tasks" className={PANEL_CLASS}>
      <h2 className="mb-3 text-base font-semibold">Tasks and next steps</h2>

      <p data-testid="next-step" className="mb-3">
        {ns === null
          ? "Next step: none — no open tasks on this record."
          : `Next step: ${ns.title} — ${memberName(ns.assigneeId)}, due ${ns.dueDate} (${dueStateLabel(dueState(ns.dueDate, today))})`}
      </p>

      <ul className="flex flex-col gap-2">
        {ordered.map((task) => {
          const state = dueState(task.dueDate, today);
          return (
            <li
              key={task.id}
              data-testid="record-task"
              data-task-id={task.id}
              className="flex flex-wrap items-center gap-2 border-t border-black/5 pt-2 dark:border-white/10"
            >
              <span className="font-medium">{task.title}</span>
              <span className="text-black/60 dark:text-white/60">
                {memberName(task.assigneeId)}
              </span>
              <span className="text-black/60 dark:text-white/60">due {task.dueDate}</span>
              <span className={dueChipClass(state)}>{dueStateLabel(state)}</span>
              <span className={BADGE_CLASS}>{task.status === "done" ? "Done" : "Open"}</span>
              {task.seeded ? (
                <span className={SEEDED_BADGE_CLASS} title={SEEDED_BADGE_TITLE}>
                  SEEDED
                </span>
              ) : null}
              {task.status === "open" ? (
                <button
                  type="button"
                  data-testid="complete-task"
                  data-task-id={task.id}
                  className={BUTTON_CLASS}
                  onClick={() => onComplete(task.id)}
                >
                  Complete
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="reopen-task"
                  data-task-id={task.id}
                  className={BUTTON_CLASS}
                  onClick={() => onReopen(task.id)}
                >
                  Reopen
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Task</span>
          <input
            data-testid="task-title-input"
            required
            maxLength={120}
            className={CONTROL_CLASS}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Assignee</span>
          <select
            data-testid="task-assignee-select"
            className={CONTROL_CLASS}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            {TEAM_MEMBERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.role}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Due date</span>
          <input
            data-testid="task-due-input"
            type="date"
            required
            className={CONTROL_CLASS}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>

        <button type="submit" data-testid="create-task" className={BUTTON_CLASS}>
          Assign task
        </button>
      </form>
    </section>
  );
}
