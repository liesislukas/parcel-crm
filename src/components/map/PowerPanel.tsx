"use client";

import { UNAVAILABLE_LABEL } from "@/lib/parcel";
import type { LngLat } from "@/lib/geo";
import {
  formatDistance,
  nearestPowerFeature,
  powerFeatureLabel,
  POWER_DERIVATION,
  type PowerFeature,
  type PowerMeta,
  type NearestResult,
} from "@/lib/power";

type PowerPanelProps = {
  state:
    | { status: "loading" }
    | { status: "failed" }
    | { status: "ready"; features: PowerFeature[]; meta: PowerMeta };
  selection: { pin: string; centre: LngLat }[];
};

const PANEL_CLASS = "rounded-lg border border-black/10 p-4 text-sm dark:border-white/15";
const MISSING_CLASS = "text-black/45 italic dark:text-white/45";

/**
 * Every composed sentence below is built as one plain-string expression rather than mixed
 * JSX text/expression children, so the rendered text can never drift from the copy in the
 * plan by way of JSX's whitespace-collapsing rules around line breaks.
 */
function nearestRow(
  kindLabel: string,
  testId: string,
  result: NearestResult | null,
  noneCopy: string,
) {
  if (!result) {
    return (
      <p data-testid={testId} className="mt-1">
        {noneCopy}
      </p>
    );
  }
  const headline = `Nearest ${kindLabel} — ${formatDistance(result.metres)} from parcel ${result.fromPin}`;
  const voltage = result.feature.voltage.present
    ? result.feature.voltage.value + " V"
    : UNAVAILABLE_LABEL;
  const operator = result.feature.operator.present
    ? result.feature.operator.value
    : UNAVAILABLE_LABEL;
  const detail = `${powerFeatureLabel(result.feature)} · Voltage ${voltage} · Operator ${operator}`;
  return (
    <p data-testid={testId} className="mt-1">
      {headline}
      <br />
      {detail}
      <br />
      <a href={result.feature.osmUrl} target="_blank" rel="noreferrer" className="underline">
        View this feature on OpenStreetMap
      </a>
    </p>
  );
}

export default function PowerPanel({ state, selection }: PowerPanelProps) {
  if (state.status === "loading") {
    return (
      <div data-testid="power-panel" className={PANEL_CLASS}>
        <h2 className="text-sm font-semibold">Power infrastructure</h2>
        <p>Loading power infrastructure…</p>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div data-testid="power-panel" className={PANEL_CLASS}>
        <h2 className="text-sm font-semibold">Power infrastructure</h2>
        <p data-testid="power-failed">
          Could not load the power infrastructure data file. The parcel map is unaffected. Reload
          the page.
        </p>
      </div>
    );
  }

  const { features, meta } = state;

  const nearestSubstation =
    selection.length === 0 ? null : nearestPowerFeature(selection, features, "substation");
  const nearestLine =
    selection.length === 0 ? null : nearestPowerFeature(selection, features, "transmission-line");

  return (
    <div data-testid="power-panel" className={PANEL_CLASS}>
      <h2 className="text-sm font-semibold">Power infrastructure</h2>

      <div data-testid="power-nearest" className="mt-2">
        {selection.length === 0 ? (
          <p>
            Select one or more parcels to see the distance to the nearest displayed power
            infrastructure.
          </p>
        ) : (
          <>
            {nearestRow(
              "substation",
              "power-nearest-substation",
              nearestSubstation,
              "No substation in the loaded snapshot.",
            )}
            {nearestRow(
              "transmission line",
              "power-nearest-line",
              nearestLine,
              "No transmission line in the loaded snapshot.",
            )}
          </>
        )}
        <p data-testid="power-derivation" className="mt-2 text-xs text-black/60 dark:text-white/60">
          {`How this is derived: ${POWER_DERIVATION}`}
        </p>
      </div>

      <div data-testid="power-sources" className="mt-3 space-y-2">
        {meta.categories.map((c) => {
          const liveCount = features.filter((f) => f.kind === c.key).length;
          const availableCopy = `${c.label} — ${liveCount} features loaded · Source: ${meta.source} via the ${meta.sourceQueryApi}, retrieved ${meta.retrievedAt.slice(0, 10)} · Licence: ${meta.sourceLicense} · ${c.note}`;
          const unavailableCopy = `${c.label} — ${UNAVAILABLE_LABEL}. ${c.note} Checked: ${c.checked}`;
          return (
            <div
              key={c.key}
              data-testid={"power-category-" + c.key}
              data-power-category-available={String(c.available)}
              className="border-t border-black/5 pt-2 dark:border-white/10"
            >
              {c.available ? (
                <p>{availableCopy}</p>
              ) : (
                <p className={MISSING_CLASS}>{unavailableCopy}</p>
              )}
            </div>
          );
        })}
      </div>

      <div
        data-testid="power-caveats"
        className="mt-3 space-y-2 text-xs text-black/60 dark:text-white/60"
      >
        <p>
          OpenStreetMap is crowd-sourced. Completeness is not guaranteed and no coverage figure is
          published for this county, so treat these counts as a floor, not a census.
        </p>
        <p>
          {`${meta.crossCheck.source} reports ${meta.crossCheck.featureCount} features over the same box. ${meta.crossCheck.note} ${meta.crossCheck.licenseNote}`}{" "}
          <a href={meta.crossCheck.url} target="_blank" rel="noreferrer" className="underline">
            View the HIFLD layer
          </a>
        </p>
        <p>{`Extent: ${meta.bboxLabel}. ${meta.bboxNote}`}</p>
        <p>
          {`${meta.sourceAttribution} · ${meta.sourceLicenseNote}`}{" "}
          <a href={meta.sourceLicenseUrl} target="_blank" rel="noreferrer" className="underline">
            Licence terms
          </a>
        </p>
      </div>
    </div>
  );
}
