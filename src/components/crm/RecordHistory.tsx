"use client";

import type { ActivityEvent } from "@/lib/crm/acquisition";

const PANEL_CLASS = "rounded-lg border border-black/10 p-4 text-sm dark:border-white/15";
const BADGE_CLASS = "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
const SEEDED_BADGE_CLASS = `${BADGE_CLASS} bg-black/[.06] text-black/55 dark:bg-white/[.10] dark:text-white/55`;
const SEEDED_BADGE_TITLE = "Seeded demo record — not entered by a user of this deployment";

/**
 * Safe here only because this component renders nothing but the placeholder until
 * `hydrated` is true, so it never runs during server rendering. Do not move this call
 * above the guard.
 */
function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

type Props = {
  events: ActivityEvent[]; // already filtered to this record's entityKey by the caller
  hydrated: boolean;
};

export function RecordHistory(props: Props) {
  if (!props.hydrated) {
    return <p className="text-xs text-black/45 dark:text-white/45">Loading CRM data…</p>;
  }

  const sorted = [...props.events].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <section data-testid="record-history" className={PANEL_CLASS}>
      <h2 className="mb-3 text-base font-semibold">Record history</h2>
      {sorted.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          No history yet. Editing the stage, interest or asking price, or completing a task, records
          an entry here.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {sorted.map((event) => (
            <li
              key={event.id}
              data-testid="history-event"
              data-kind={event.kind}
              className="border-l-2 border-black/10 pl-3 dark:border-white/15"
            >
              <p>{event.summary}</p>
              <p className="text-xs text-black/45 dark:text-white/45">
                {formatEventTime(event.at)} · {event.actor}
              </p>
              {event.seeded ? (
                <span className={SEEDED_BADGE_CLASS} title={SEEDED_BADGE_TITLE}>
                  SEEDED
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
