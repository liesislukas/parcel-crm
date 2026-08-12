"use client";

import Link from "next/link";
import {
  ASKING_PRICE_UNSET,
  ENTITY_TYPE_LABEL,
  INTEREST_LABEL,
  STAGE_ACTIVE_CLASS,
  STAGE_LABEL,
  dueState,
  dueStateLabel,
  entityKey,
  type AcquisitionRecord,
  type Task,
} from "@/lib/crm/acquisition";
import { formatMoney } from "@/lib/parcel";

const TH_CLASS =
  "border-b border-black/10 py-2 pr-3 text-xs font-medium tracking-wide text-black/55 uppercase dark:border-white/15 dark:text-white/55";
const TD_CLASS = "border-b border-black/5 py-2 pr-3 align-top dark:border-white/10";
const BADGE_CLASS = "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
const SEEDED_BADGE_CLASS = `${BADGE_CLASS} bg-black/[.06] text-black/55 dark:bg-white/[.10] dark:text-white/55`;
const SEEDED_BADGE_TITLE = "Seeded demo record — not entered by a user of this deployment";

function dueChipClass(state: ReturnType<typeof dueState>): string {
  if (state === "overdue") return `${BADGE_CLASS} bg-rose-600/15 text-rose-700 dark:text-rose-300`;
  if (state === "today") return `${BADGE_CLASS} bg-amber-500/20 text-amber-700 dark:text-amber-300`;
  return `${BADGE_CLASS} bg-black/[.06] text-black/60 dark:bg-white/[.10] dark:text-white/60`;
}

export function PipelineTable(props: {
  rows: { record: AcquisitionRecord; openTaskCount: number; next: Task | null }[];
  today: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table data-testid="pipeline-table" className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            <th className={TH_CLASS}>Record</th>
            <th className={TH_CLASS}>Type</th>
            <th className={TH_CLASS}>Stage</th>
            <th className={TH_CLASS}>Interest</th>
            <th className={TH_CLASS}>Asking price</th>
            <th className={TH_CLASS}>Open tasks</th>
            <th className={TH_CLASS}>Next step</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map(({ record, openTaskCount, next }) => {
            const key = entityKey(record.entity);
            const href = `/acquisitions?record=${record.entity.type}&id=${encodeURIComponent(record.entity.id)}`;
            return (
              <tr key={key} data-testid="pipeline-row" data-entity-key={key}>
                <td className={TD_CLASS}>
                  <Link href={href} className="font-medium underline-offset-2 hover:underline">
                    {record.entity.label}
                  </Link>
                  {record.seeded ? (
                    <span className={`ml-1.5 ${SEEDED_BADGE_CLASS}`} title={SEEDED_BADGE_TITLE}>
                      SEEDED
                    </span>
                  ) : null}
                  <br />
                  <span className="text-xs text-black/45 dark:text-white/45">
                    {record.entity.detail}
                  </span>
                </td>
                <td className={TD_CLASS}>{ENTITY_TYPE_LABEL[record.entity.type]}</td>
                <td className={TD_CLASS}>
                  <span className={`${BADGE_CLASS} ${STAGE_ACTIVE_CLASS[record.stage]}`}>
                    {STAGE_LABEL[record.stage]}
                  </span>
                </td>
                <td className={TD_CLASS}>{INTEREST_LABEL[record.interest]}</td>
                <td className={TD_CLASS}>
                  {record.askingPriceUsd === null ? (
                    <span
                      data-field-state="missing"
                      className="text-black/45 italic dark:text-white/45"
                    >
                      {ASKING_PRICE_UNSET}
                    </span>
                  ) : (
                    <span data-field-state="present">{formatMoney(record.askingPriceUsd)}</span>
                  )}
                </td>
                <td className={TD_CLASS}>{openTaskCount}</td>
                <td className={TD_CLASS}>
                  {next === null ? (
                    "—"
                  ) : (
                    <>
                      {next.title}{" "}
                      <span className={dueChipClass(dueState(next.dueDate, props.today))}>
                        {dueStateLabel(dueState(next.dueDate, props.today))}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
