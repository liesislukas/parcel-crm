"use client";

import {
  ACQUISITION_STAGES,
  ACQUISITION_STAGE_LABELS,
  COUNTY_LABEL,
  COUNTY_VALUE,
  OUTREACH_STATUSES,
  OUTREACH_STATUS_LABELS,
  POWER_DISTANCE_OPTIONS,
  activeFilterCount,
  isRangeInverted,
  DEFAULT_FILTER_STATE,
  type AcquisitionStage,
  type OutreachStatus,
  type ProjectFilterState,
} from "@/lib/projectFilters";
import { POWER_NO_DATA_BANNER, POWER_UNKNOWN_LABEL, POWER_ACCESS_SOURCE } from "@/lib/powerAccess";

type ProjectFilterBarProps = {
  state: ProjectFilterState;
  onChange: (next: ProjectFilterState) => void;
  countyNote: string;
};

const CONTROL_CLASS =
  "rounded-md border border-black/20 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";
const NOTE_CLASS = "mt-1 text-xs text-black/60 dark:text-white/60";

function parseNumberInput(raw: string): number | null {
  if (raw === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

export default function ProjectFilterBar({ state, onChange, countyNote }: ProjectFilterBarProps) {
  function toggleInArray<T extends string>(current: T[], value: T, ordered: readonly T[]): T[] {
    const has = current.includes(value);
    const next = has ? current.filter((v) => v !== value) : [...current, value];
    return ordered.filter((v) => next.includes(v));
  }

  return (
    <section
      data-testid="filter-bar"
      aria-label="Project filters"
      className="rounded-lg border border-black/10 p-4 dark:border-white/15"
    >
      <h2 className="text-sm font-medium">Filters</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <fieldset>
          <legend className="text-xs font-medium">County</legend>
          <select
            data-testid="filter-county"
            className={CONTROL_CLASS}
            value={state.county}
            onChange={(e) => {
              const value = e.target.value;
              onChange({
                ...state,
                county: value === COUNTY_VALUE ? COUNTY_VALUE : "all",
              });
            }}
          >
            <option value="all">All counties</option>
            <option value={COUNTY_VALUE}>{COUNTY_LABEL}</option>
          </select>
          <p data-testid="filter-county-note" className={NOTE_CLASS}>
            {countyNote}
          </p>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium">Combined acreage</legend>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              placeholder="Any"
              aria-label="Minimum combined acreage"
              data-testid="filter-acres-min"
              className={CONTROL_CLASS}
              value={state.acresMin ?? ""}
              onChange={(e) => onChange({ ...state, acresMin: parseNumberInput(e.target.value) })}
            />
            <span className="text-xs text-black/45 dark:text-white/45">to</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              placeholder="Any"
              aria-label="Maximum combined acreage"
              data-testid="filter-acres-max"
              className={CONTROL_CLASS}
              value={state.acresMax ?? ""}
              onChange={(e) => onChange({ ...state, acresMax: parseNumberInput(e.target.value) })}
            />
          </div>
          {isRangeInverted(state) && (
            <p data-testid="filter-acres-inverted" className={NOTE_CLASS}>
              Minimum acreage is greater than maximum — no project can match.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium">Power access</legend>
          {POWER_ACCESS_SOURCE.loaded === false ? (
            <>
              <select data-testid="filter-power" className={CONTROL_CLASS} disabled value="">
                <option value="">{POWER_UNKNOWN_LABEL}</option>
              </select>
              <label className="mt-1 flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  data-testid="filter-power-unknown"
                  disabled
                  checked
                  readOnly
                />
                Include projects with unknown power access
              </label>
              <p data-testid="filter-power-nodata" className={NOTE_CLASS}>
                {POWER_NO_DATA_BANNER}
              </p>
            </>
          ) : (
            <>
              <select
                data-testid="filter-power"
                className={CONTROL_CLASS}
                value={state.powerMaxMiles === null ? "" : String(state.powerMaxMiles)}
                onChange={(e) => {
                  const raw = e.target.value;
                  onChange({ ...state, powerMaxMiles: raw === "" ? null : Number(raw) });
                }}
              >
                <option value="">Any distance</option>
                {POWER_DISTANCE_OPTIONS.map((miles) => (
                  <option key={miles} value={miles}>
                    Within {miles} mi
                  </option>
                ))}
              </select>
              <label className="mt-1 flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  data-testid="filter-power-unknown"
                  checked={state.includeUnknownPower}
                  onChange={(e) => onChange({ ...state, includeUnknownPower: e.target.checked })}
                />
                Include projects with unknown power access
              </label>
              <p data-testid="filter-power-source" className={NOTE_CLASS}>
                {`Source: ${POWER_ACCESS_SOURCE.sourceName} (${POWER_ACCESS_SOURCE.sourceLicense}), retrieved ${POWER_ACCESS_SOURCE.retrievedAt}.`}
              </p>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium">Outreach status</legend>
          <div className="flex flex-col gap-1">
            {OUTREACH_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  data-testid={`filter-outreach-${status}`}
                  checked={state.outreach.includes(status)}
                  onChange={() =>
                    onChange({
                      ...state,
                      outreach: toggleInArray<OutreachStatus>(
                        state.outreach,
                        status,
                        OUTREACH_STATUSES,
                      ),
                    })
                  }
                />
                {OUTREACH_STATUS_LABELS[status]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium">Acquisition stage</legend>
          <div className="flex flex-col gap-1">
            {ACQUISITION_STAGES.map((stage) => (
              <label key={stage} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  data-testid={`filter-stage-${stage}`}
                  checked={state.stages.includes(stage)}
                  onChange={() =>
                    onChange({
                      ...state,
                      stages: toggleInArray<AcquisitionStage>(
                        state.stages,
                        stage,
                        ACQUISITION_STAGES,
                      ),
                    })
                  }
                />
                {ACQUISITION_STAGE_LABELS[stage]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <button
        type="button"
        data-testid="filter-clear"
        className={CONTROL_CLASS + " mt-3"}
        disabled={activeFilterCount(state) === 0}
        onClick={() => onChange(DEFAULT_FILTER_STATE)}
      >
        Clear all filters
      </button>
    </section>
  );
}
