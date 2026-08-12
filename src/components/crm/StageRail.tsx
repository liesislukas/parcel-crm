"use client";

import { Fragment } from "react";
import {
  STAGE_ACTIVE_CLASS,
  STAGE_INACTIVE_CLASS,
  STAGE_LABEL,
  STAGE_ORDER,
  TERMINAL_LOST,
  type AcquisitionStage,
} from "@/lib/crm/acquisition";

const CONNECTOR_CLASS = "text-black/25 dark:text-white/25";

function StageButton({
  stage,
  current,
  onChange,
}: {
  stage: AcquisitionStage;
  current: AcquisitionStage;
  onChange: (next: AcquisitionStage) => void;
}) {
  const isCurrent = stage === current;
  return (
    <button
      type="button"
      data-testid="stage-option"
      data-stage={stage}
      data-current={String(isCurrent)}
      aria-current={isCurrent ? "step" : undefined}
      onClick={() => onChange(stage)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        isCurrent ? STAGE_ACTIVE_CLASS[stage] : STAGE_INACTIVE_CLASS
      }`}
    >
      {STAGE_LABEL[stage]}
    </button>
  );
}

export function StageRail(props: {
  stage: AcquisitionStage;
  onChange: (next: AcquisitionStage) => void;
}) {
  return (
    <div data-testid="stage-rail" className="flex flex-wrap items-center gap-1">
      {STAGE_ORDER.map((stage, i) => (
        <Fragment key={stage}>
          <StageButton stage={stage} current={props.stage} onChange={props.onChange} />
          {i < STAGE_ORDER.length - 1 ? (
            <span aria-hidden="true" className={CONNECTOR_CLASS}>
              →
            </span>
          ) : null}
        </Fragment>
      ))}
      <span aria-hidden="true" className={`px-1 ${CONNECTOR_CLASS}`}>
        ·
      </span>
      <StageButton stage={TERMINAL_LOST} current={props.stage} onChange={props.onChange} />
    </div>
  );
}
