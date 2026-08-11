"use client";

import type { ReactNode } from "react";
import {
  formatAcres,
  formatMoney,
  TAX_EXEMPT_NOTE,
  UNAVAILABLE_LABEL,
  type FieldState,
  type Parcel,
} from "@/lib/parcel";

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

      <p className="mt-4 text-xs text-black/45 dark:text-white/45">
        Fields shown come from the Rock Island County GIS parcel layer as published. Values are
        never defaulted, substituted, or cleaned.
      </p>
    </div>
  );
}
