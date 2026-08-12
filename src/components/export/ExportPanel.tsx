"use client";

import { useEffect, useState } from "react";
import { CSV_BOM, CSV_MIME, toCsv } from "@/lib/export/csv";
import {
  EXPORT_DATASETS,
  exportFilename,
  scopeLabel as scopeLabelOf,
  type ColumnClass,
  type ExportDataset,
  type ExportDatasetId,
  type ExportScope,
} from "@/lib/export/datasets";
import {
  buildDataset,
  datasetAvailability,
  loadProjectOptions,
  type ProjectOptions,
} from "@/lib/export/sources";

// Verbatim copy of MapWorkspace.tsx's BUTTON_CLASS so the disabled styling matches. Not
// imported: MapWorkspace does not export it, and it is not a shared module.
const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

type CardState =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "done"; filename: string; rowCount: number; columnCount: number; scopeLabel: string }
  | { kind: "error"; message: string };

const CLASS_BADGE: Record<ColumnClass, string> = {
  county: "county",
  mock: "mock",
  crm: "crm",
  export: "file",
};

function download(filename: string, csv: string): void {
  const blob = new Blob([CSV_BOM + csv], { type: CSV_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously after click() cancels the download in Chromium.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function initialCardStates(): Record<ExportDatasetId, CardState> {
  return {
    parcels: { kind: "idle" },
    owners: { kind: "idle" },
    "campaign-activity": { kind: "idle" },
  };
}

export default function ExportPanel() {
  const [scope, setScope] = useState<ExportScope>({ kind: "all" });
  const [projects, setProjects] = useState<ProjectOptions | null>(null);
  const [cardStates, setCardStates] =
    useState<Record<ExportDatasetId, CardState>>(initialCardStates());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await loadProjectOptions();
      if (!cancelled) setProjects(result);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleScopeChange(value: string) {
    if (value === "all") {
      setScope({ kind: "all" });
    } else if (projects?.available) {
      const option = projects.options.find((p) => p.id === value);
      if (option)
        setScope({ kind: "project", id: option.id, name: option.name, slug: option.slug });
    }
    // Changing the scope resets every card's state so a stale result line can never sit
    // under a different scope.
    setCardStates(initialCardStates());
  }

  async function handleDownload(dataset: ExportDataset) {
    setCardStates((prev) => ({ ...prev, [dataset.id]: { kind: "preparing" } }));
    try {
      const generatedAt = new Date().toISOString();
      const { header, rows } = await buildDataset(dataset.id, scope, generatedAt);
      const csv = toCsv(header, rows);
      const filename = exportFilename(dataset.filenameStem, scope, generatedAt);
      download(filename, csv);
      setCardStates((prev) => ({
        ...prev,
        [dataset.id]: {
          kind: "done",
          filename,
          rowCount: rows.length,
          columnCount: header.length,
          scopeLabel: scopeLabelOf(scope),
        },
      }));
    } catch (err) {
      setCardStates((prev) => ({
        ...prev,
        [dataset.id]: {
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        data-testid="export-legend"
        className="max-w-2xl rounded-lg border border-black/10 p-4 text-sm leading-relaxed text-black/70 dark:border-white/15 dark:text-white/70"
      >
        <p>
          <strong>What the columns mean.</strong> Columns with no suffix come from the Rock Island
          County GIS parcel layer (retrieved 2026-08-11) and are exported verbatim — never rounded,
          reformatted, or defaulted. Columns ending <code>_mock</code> are simulated by this
          application: they are not real contact details, and no email, letter, or SMS was ever
          sent. Columns ending <code>_crm</code> are records you created in this CRM. An empty cell
          in a county column means the county published no value for that field — it is never a
          zero. A real $0 assessed value exports as <code>0</code>, because 2,330 of the 65,955
          loaded parcels are tax-exempt and their zero is a fact. The raw county attributes file is
          also public at{" "}
          <a href="/data/rock-island-parcels.attrs.json" className="underline">
            /data/rock-island-parcels.attrs.json
          </a>{" "}
          if you would rather have JSON than CSV.
        </p>
      </div>

      <div className="max-w-2xl">
        <label htmlFor="export-scope" className="text-sm font-medium">
          Scope
        </label>
        <select
          id="export-scope"
          data-testid="export-scope"
          value={scope.kind === "all" ? "all" : scope.id}
          onChange={(e) => handleScopeChange(e.target.value)}
          className="mt-1 block w-full rounded-md border border-black/20 bg-transparent px-3 py-1.5 text-sm dark:border-white/25"
        >
          <option value="all">All loaded parcels (no project filter)</option>
          {projects?.available &&
            projects.options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        {projects && !projects.available && (
          <p className="mt-1 text-xs text-black/60 dark:text-white/60">{projects.reason}</p>
        )}
        {projects?.available && projects.options.length === 0 && (
          <p className="mt-1 text-xs text-black/60 dark:text-white/60">
            No projects saved yet — create one on the Projects page to scope an export.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {EXPORT_DATASETS.map((dataset) => {
          const availability = datasetAvailability(dataset.id);
          const state = cardStates[dataset.id];
          const preparing = state.kind === "preparing";

          return (
            <section
              key={dataset.id}
              data-testid={`export-card-${dataset.id}`}
              className="max-w-2xl rounded-lg border border-black/10 p-4 dark:border-white/15"
            >
              <h2 className="text-sm font-medium">{dataset.title}</h2>
              <p className="mt-1 text-sm text-black/65 dark:text-white/65">{dataset.description}</p>

              <button
                type="button"
                data-testid={`download-${dataset.id}`}
                disabled={!availability.available || preparing}
                onClick={() => handleDownload(dataset)}
                className={`${BUTTON_CLASS} mt-3`}
              >
                {preparing ? "Preparing…" : `Download ${dataset.title.toLowerCase()} CSV`}
              </button>

              {!availability.available && (
                <p
                  data-testid={`export-unavailable-${dataset.id}`}
                  className="mt-2 text-sm text-black/60 dark:text-white/60"
                >
                  {availability.reason}
                </p>
              )}

              {state.kind === "done" && (
                <p
                  data-testid={`export-result-${dataset.id}`}
                  className="mt-2 text-sm text-black/70 dark:text-white/70"
                >
                  {state.filename} — {state.rowCount.toLocaleString("en-US")} rows,{" "}
                  {state.columnCount} columns, scope: {state.scopeLabel}
                </p>
              )}

              {state.kind === "error" && (
                <p
                  data-testid={`export-error-${dataset.id}`}
                  className="mt-2 text-sm text-red-700 dark:text-red-400"
                >
                  Could not build the export: {state.message}. Reload the page and try again.
                </p>
              )}

              <details className="mt-3 text-xs text-black/60 dark:text-white/60">
                <summary>{dataset.columns.length} columns</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {dataset.columns.map((column) => (
                    <li key={column.name}>
                      <code>{column.name}</code> — {column.note}{" "}
                      <span className="rounded border border-black/15 px-1 py-0.5 text-[10px] tracking-wide uppercase dark:border-white/20">
                        {CLASS_BADGE[column.class]}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
