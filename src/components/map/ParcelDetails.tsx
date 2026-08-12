"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  formatAcres,
  formatMoney,
  TAX_EXEMPT_NOTE,
  UNAVAILABLE_LABEL,
  type FieldState,
  type Parcel,
} from "@/lib/parcel";
import { useAcquisitionStore } from "@/lib/crm/useAcquisitionStore";
import {
  ASKING_PRICE_UNSET,
  INTEREST_LABEL,
  STAGE_ACTIVE_CLASS,
  STAGE_LABEL,
  dueState,
  dueStateLabel,
  entityKey,
  nextStep,
  type AcquisitionRecord,
  type EntityRef,
} from "@/lib/crm/acquisition";
import { memberName } from "@/lib/crm/team";

const PANEL_CLASS = "rounded-lg border border-black/10 p-4 text-sm dark:border-white/15";
const MISSING_CLASS = "text-black/45 italic dark:text-white/45";
const NOTE_CLASS = "mt-0.5 block text-xs text-black/45 dark:text-white/45";

/**
 * The single renderer for an absent source field. Every `FieldState` row goes through it,
 * so nothing can quietly fall back to a blank, a dash, or a zero.
 */
function Missing() {
  return (
    <dd data-field-state="missing" className={MISSING_CLASS}>
      {UNAVAILABLE_LABEL}
    </dd>
  );
}

function Present({ children }: { children: ReactNode }) {
  return <dd data-field-state="present">{children}</dd>;
}

function TextRow({
  field,
  label,
  state,
}: {
  field: string;
  label: string;
  state: FieldState<string>;
}) {
  return (
    <div data-field={field} className="border-t border-black/5 pt-2 dark:border-white/10">
      <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">{label}</dt>
      {state.present ? <Present>{state.value}</Present> : <Missing />}
    </div>
  );
}

function MoneyRow({
  field,
  label,
  state,
  zeroNote = false,
}: {
  field: string;
  label: string;
  state: FieldState<number>;
  /** Only the EAV row carries the tax-exempt note — the note names EAV explicitly. */
  zeroNote?: boolean;
}) {
  return (
    <div data-field={field} className="border-t border-black/5 pt-2 dark:border-white/10">
      <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">{label}</dt>
      {state.present ? (
        <Present>
          {formatMoney(state.value)}
          {/* A real zero is shown as a zero and explained. An absent value is shown as
              "Not available". Conflating the two in either direction is a fabrication. */}
          {zeroNote && state.value === 0 ? (
            <span className={NOTE_CLASS}>{TAX_EXEMPT_NOTE}</span>
          ) : null}
        </Present>
      ) : (
        <Missing />
      )}
    </div>
  );
}

export default function ParcelDetails({ parcel }: { parcel: Parcel | null }) {
  if (!parcel) {
    return (
      <div data-testid="parcel-details" className={PANEL_CLASS}>
        Click a parcel on the map to see its details.
      </div>
    );
  }

  return (
    <div data-testid="parcel-details" className={PANEL_CLASS}>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div data-field="pin" className="border-t border-black/5 pt-2 dark:border-white/10">
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Parcel ID (PIN)
          </dt>
          <dd data-field-state="present" className="font-mono">
            {parcel.pin}
          </dd>
        </div>

        <TextRow field="owner" label="Owner" state={parcel.owner} />
        <TextRow field="taxBillName" label="Tax bill name" state={parcel.taxBillName} />
        <MoneyRow
          field="assessedValue"
          label="Assessed value (EAV)"
          state={parcel.assessedValue}
          zeroNote
        />
        <MoneyRow field="marketValue" label="Est. market value (EMV)" state={parcel.marketValue} />

        {/* `taxbill_csz` is one combined string — "CORDOVA IL 612420006". There is no
            separate city, state or zip field, so it is never split. */}
        <div
          data-field="mailingStreet"
          className="border-t border-black/5 pt-2 dark:border-white/10"
        >
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Mailing address
          </dt>
          {parcel.mailingStreet.present ? (
            <Present>{parcel.mailingStreet.value}</Present>
          ) : (
            <Missing />
          )}
          {parcel.mailingCityStateZip.present ? (
            <dd data-field="mailingCityStateZip" data-field-state="present">
              {parcel.mailingCityStateZip.value}
            </dd>
          ) : (
            <dd
              data-field="mailingCityStateZip"
              data-field-state="missing"
              className={MISSING_CLASS}
            >
              {UNAVAILABLE_LABEL}
            </dd>
          )}
        </div>

        <div data-field="acres" className="border-t border-black/5 pt-2 dark:border-white/10">
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Acreage
          </dt>
          {parcel.acres.present ? (
            <Present>{formatAcres(parcel.acres.value)}</Present>
          ) : (
            <Missing />
          )}
        </div>
      </dl>

      <ParcelAcquisitionStrip parcel={parcel} />

      <p className="mt-4 text-xs text-black/45 dark:text-white/45">
        Fields shown come from the Rock Island County GIS parcel layer as published. Values are
        never defaulted, substituted, or cleaned.
      </p>
    </div>
  );
}

const ACQUISITION_BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";
const ACQUISITION_BADGE_CLASS = "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";

/**
 * Reads the acquisition record (if any) for the selected parcel and links to, or starts,
 * its acquisition tracking. Built from the parcel alone, with no fetch: the entity ref's
 * `detail` line is composed from fields already on `Parcel`, falling back to
 * `UNAVAILABLE_LABEL` rather than a blank or a zero for anything absent in the county
 * source.
 */
function ParcelAcquisitionStrip({ parcel }: { parcel: Parcel }) {
  const api = useAcquisitionStore();

  const ref: EntityRef = {
    type: "parcel",
    id: parcel.pin,
    label: `PIN ${parcel.pin}`,
    detail: [
      parcel.acres.present ? formatAcres(parcel.acres.value) : UNAVAILABLE_LABEL,
      parcel.assessedValue.present
        ? `EAV ${formatMoney(parcel.assessedValue.value)}`
        : `EAV ${UNAVAILABLE_LABEL}`,
      parcel.owner.present ? parcel.owner.value : UNAVAILABLE_LABEL,
    ].join(" · "),
  };
  const key = entityKey(ref);
  const record = api.store.records[key];

  return (
    <section
      data-testid="parcel-acquisition"
      className="mt-4 border-t border-black/10 pt-3 dark:border-white/15"
    >
      <h3 className="mb-2 text-sm font-semibold">Acquisition</h3>
      {!api.hydrated ? (
        <p className="text-xs text-black/45 dark:text-white/45">Loading CRM data…</p>
      ) : record ? (
        <ParcelAcquisitionSummary
          parcelPin={parcel.pin}
          entityKey={key}
          record={record}
          api={api}
        />
      ) : (
        <div className="flex flex-col items-start gap-2 text-sm">
          <span className="text-black/60 dark:text-white/60">
            Not in the acquisition pipeline yet.
          </span>
          <button
            type="button"
            data-testid="track-acquisition"
            className={ACQUISITION_BUTTON_CLASS}
            onClick={() => api.ensureRecord(ref)}
          >
            Track acquisition
          </button>
        </div>
      )}
    </section>
  );
}

function ParcelAcquisitionSummary({
  parcelPin,
  entityKey: key,
  record,
  api,
}: {
  parcelPin: string;
  entityKey: string;
  record: AcquisitionRecord;
  api: ReturnType<typeof useAcquisitionStore>;
}) {
  const tasksForRecord = api.store.tasks.filter((t) => entityKey(t.entity) === key);
  const openTaskCount = tasksForRecord.filter((t) => t.status === "open").length;
  const ns = nextStep(tasksForRecord);

  return (
    <div className="flex flex-col items-start gap-1 text-sm">
      <span className={`${ACQUISITION_BADGE_CLASS} ${STAGE_ACTIVE_CLASS[record.stage]}`}>
        {STAGE_LABEL[record.stage]}
      </span>
      <span>Interest: {INTEREST_LABEL[record.interest]}</span>
      <span>
        {record.askingPriceUsd === null ? (
          <span data-field-state="missing" className="text-black/45 italic dark:text-white/45">
            {ASKING_PRICE_UNSET}
          </span>
        ) : (
          <span data-field-state="present">{formatMoney(record.askingPriceUsd)}</span>
        )}
      </span>
      <span>{openTaskCount} open tasks</span>
      <span>
        {ns === null
          ? "Next step: none — no open tasks on this record."
          : `Next step: ${ns.title} — ${memberName(ns.assigneeId)}, due ${ns.dueDate} (${dueStateLabel(dueState(ns.dueDate, api.today))})`}
      </span>
      <Link
        data-testid="track-acquisition"
        href={`/acquisitions?record=parcel&id=${encodeURIComponent(parcelPin)}`}
        className="underline-offset-2 hover:underline"
      >
        Open acquisition record
      </Link>
    </div>
  );
}
