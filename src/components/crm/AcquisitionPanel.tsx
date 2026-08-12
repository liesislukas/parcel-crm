"use client";

import { useState } from "react";
import { StageRail } from "@/components/crm/StageRail";
import {
  ALL_INTERESTS,
  ASKING_PRICE_UNSET,
  INTEREST_LABEL,
  type AcquisitionRecord,
  type AcquisitionStage,
  type InterestLevel,
} from "@/lib/crm/acquisition";
import { formatMoney } from "@/lib/parcel";

const PANEL_CLASS = "rounded-lg border border-black/10 p-4 text-sm dark:border-white/15";
const LABEL_CLASS = "text-xs tracking-wide text-black/55 uppercase dark:text-white/55";
const CONTROL_CLASS =
  "rounded-md border border-black/20 bg-transparent px-2 py-1.5 text-sm dark:border-white/25";
const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

type Props = {
  record: AcquisitionRecord;
  hydrated: boolean;
  onStageChange: (next: AcquisitionStage) => void;
  onSave: (interest: InterestLevel, askingPriceUsd: number | null) => void;
};

export function AcquisitionPanel(props: Props) {
  if (!props.hydrated) {
    return <p className="text-xs text-black/45 dark:text-white/45">Loading CRM data…</p>;
  }
  return <AcquisitionPanelBody {...props} />;
}

function AcquisitionPanelBody({ record, onStageChange, onSave }: Props) {
  const [interest, setInterest] = useState<InterestLevel>(record.interest);
  const [priceInput, setPriceInput] = useState<string>(
    record.askingPriceUsd === null ? "" : String(record.askingPriceUsd),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = priceInput.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    const finalPrice = parsed === null || !Number.isFinite(parsed) || parsed < 0 ? null : parsed;
    onSave(interest, finalPrice);
  }

  return (
    <section data-testid="acquisition-panel" className={PANEL_CLASS}>
      <h2 className="mb-3 text-base font-semibold">Acquisition status</h2>

      <StageRail stage={record.stage} onChange={onStageChange} />

      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Interest</span>
          <select
            data-testid="interest-select"
            className={CONTROL_CLASS}
            value={interest}
            onChange={(e) => setInterest(e.target.value as InterestLevel)}
          >
            {ALL_INTERESTS.map((level) => (
              <option key={level} value={level}>
                {INTEREST_LABEL[level]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Asking price (USD)</span>
          <input
            data-testid="asking-price-input"
            type="number"
            min="0"
            step="1000"
            inputMode="numeric"
            className={CONTROL_CLASS}
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
        </label>

        <button type="submit" data-testid="save-acquisition" className={BUTTON_CLASS}>
          Save interest and asking price
        </button>
      </form>

      <p className="mt-3">
        <span className={LABEL_CLASS}>Recorded asking price</span>
        <br />
        {record.askingPriceUsd === null ? (
          <span data-field-state="missing" className="text-black/45 italic dark:text-white/45">
            {ASKING_PRICE_UNSET}
          </span>
        ) : (
          <span data-field-state="present">{formatMoney(record.askingPriceUsd)}</span>
        )}
      </p>
    </section>
  );
}
