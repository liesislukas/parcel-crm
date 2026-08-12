"use client";

import { useState } from "react";
import Link from "next/link";
import { formatAcres, UNAVAILABLE_LABEL, type Parcel } from "@/lib/parcel";
import {
  computeProjectStats,
  contiguityLabel,
  type Project,
  type ProjectStats,
} from "@/lib/project";
import {
  createProject,
  replaceProjectParcelIds,
  STORAGE_UNAVAILABLE_MESSAGE,
} from "@/lib/projectStore";
import type { AdjacencyIndex } from "@/lib/adjacency";

type SelectionActionsProps = {
  selectedIds: string[];
  parcelsById: ReadonlyMap<string, Parcel>;
  adjacency: AdjacencyIndex;
  onRemoveId: (id: string) => void;
  onFocusId: (id: string) => void;
  onReplaceSelection: (ids: string[]) => void;
  editingProject?: Project | null;
  onProjectSaved?: (project: Project) => void;
};

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

const NOTE_CLASS = "mt-2 text-xs text-black/60 dark:text-white/60";

function memberCountLabel(stats: ProjectStats): string {
  return `${stats.members.length} parcel${stats.members.length === 1 ? "" : "s"}`;
}

function ownerCountLabel(stats: ProjectStats): string {
  return `${stats.ownerCount} distinct owner${stats.ownerCount === 1 ? "" : "s"}`;
}

export default function SelectionActions(props: SelectionActionsProps) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const stats = computeProjectStats(props.selectedIds, props.parcelsById, props.adjacency);

  function handleCreate() {
    try {
      const project = createProject(
        name.trim(),
        stats.members.map((m) => m.id),
      );
      setResult({
        kind: "ok",
        text: `Created “${project.name}” — ${project.parcelIds.length} parcels, ${formatAcres(stats.combinedAcres)}, ${contiguityLabel(stats.blocks.length)}.`,
      });
      setName("");
    } catch {
      setResult({ kind: "error", text: STORAGE_UNAVAILABLE_MESSAGE });
    }
  }

  function handleSave() {
    const editingProject = props.editingProject;
    if (!editingProject) return;
    try {
      const updated = replaceProjectParcelIds(
        editingProject.id,
        stats.members.map((m) => m.id),
      );
      if (updated === null) {
        setResult({ kind: "error", text: "That project is no longer saved in this browser." });
        return;
      }
      props.onProjectSaved?.(updated);
      setResult({
        kind: "ok",
        text: `Saved “${updated.name}” — ${updated.parcelIds.length} parcels, ${formatAcres(stats.combinedAcres)}, ${contiguityLabel(stats.blocks.length)}.`,
      });
    } catch {
      setResult({ kind: "error", text: STORAGE_UNAVAILABLE_MESSAGE });
    }
  }

  return (
    <section
      data-testid="selection-actions"
      className="mt-3 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15"
    >
      <h2 className="text-sm font-semibold">Selection</h2>

      <p data-testid="selection-stats" className="mt-1">
        <span data-testid="selection-parcels">{memberCountLabel(stats)}</span>
        {" · "}
        <span data-testid="selection-acres">{formatAcres(stats.combinedAcres)}</span>
        {" · "}
        <span data-testid="selection-blocks">{contiguityLabel(stats.blocks.length)}</span>
        {" · "}
        <span data-testid="selection-owners">{ownerCountLabel(stats)}</span>
      </p>

      <p data-testid="acreage-method" className={NOTE_CLASS}>
        Combined acreage sums the county&apos;s GIS_acres_num for each distinct parcel outline in
        the group. Row figures are rounded to two decimals for display; the total is computed from
        the unrounded county values.
      </p>
      <p data-testid="adjacency-rule" className={NOTE_CLASS}>
        Adjacent means the two parcels&apos; published outlines share at least one identical
        boundary segment. Parcels meeting at a single corner point are not counted as adjacent. Rock
        Island County records streets and alleys as gaps between parcels, so a group spanning a
        street reports more than one block.
      </p>
      {stats.duplicateFootprintRecords > 0 ? (
        <p data-testid="duplicate-footprint-note" className={NOTE_CLASS}>
          {stats.duplicateFootprintRecords} member record(s) repeat {stats.duplicateFootprintGroups}{" "}
          parcel outline(s) already counted — Rock Island County files condominium and PUD units
          against the whole outline. Each outline is counted once. Summing every record instead
          would give {formatAcres(stats.plainSumAcres)}.
        </p>
      ) : null}
      {stats.acreageMissingCount > 0 ? (
        <p data-testid="acreage-missing-note" className={NOTE_CLASS}>
          {stats.acreageMissingCount} member parcel(s) have no acreage in the county source and are
          excluded from the total.
        </p>
      ) : null}
      {stats.missingIds.length > 0 ? (
        <p data-testid="missing-pins-note" className={NOTE_CLASS}>
          {stats.missingIds.length} member parcel record(s) are no longer in the loaded county data
          and are excluded from these figures.
        </p>
      ) : null}
      <p data-testid="owner-count-note" className={NOTE_CLASS}>
        Distinct owners are counted by exact owner1_name string as the county publishes it. The
        county publishes no owner id, so two spellings of the same person count separately.
      </p>

      {stats.blocks.length > 1 ? (
        <button
          type="button"
          data-testid="keep-largest-block"
          onClick={() => props.onReplaceSelection(stats.blocks[0])}
          className={`mt-2 ${BUTTON_CLASS}`}
        >
          {`Keep largest block (${stats.blocks[0].length} parcels)`}
        </button>
      ) : null}

      <ul data-testid="member-list" className="mt-3 max-h-64 overflow-y-auto">
        {stats.members.map((parcel) => (
          <li key={parcel.id} data-testid="member-row" data-pin={parcel.pin}>
            <button
              type="button"
              data-testid="member-pin"
              onClick={() => props.onFocusId(parcel.id)}
              className="font-mono underline"
            >
              {parcel.pin}
            </button>
            <span data-testid="member-owner">
              {parcel.owner.present ? parcel.owner.value : UNAVAILABLE_LABEL}
            </span>
            <span data-testid="member-acres">
              {parcel.acres.present ? formatAcres(parcel.acres.value) : UNAVAILABLE_LABEL}
            </span>
            <button
              type="button"
              data-testid="remove-member"
              onClick={() => props.onRemoveId(parcel.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {props.editingProject ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="save-project-selection"
            onClick={handleSave}
            disabled={stats.members.length === 0}
            className={BUTTON_CLASS}
          >
            {`Save selection to “${props.editingProject.name}”`}
          </button>
          <Link href="/" data-testid="stop-editing" className="underline">
            Stop editing
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              data-testid="project-name"
              value={name}
              maxLength={80}
              placeholder="Project name"
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-black/20 px-2 py-1.5 text-sm dark:border-white/25"
            />
            <button
              type="button"
              data-testid="create-project"
              onClick={handleCreate}
              disabled={name.trim() === "" || stats.members.length === 0}
              className={BUTTON_CLASS}
            >
              Create project
            </button>
          </div>
          {stats.members.length === 0 ? (
            <p data-testid="create-hint" className="mt-1 text-xs text-black/60 dark:text-white/60">
              Select at least one parcel on the map to create a project.
            </p>
          ) : name.trim() === "" ? (
            <p data-testid="create-hint" className="mt-1 text-xs text-black/60 dark:text-white/60">
              Name the project to create it.
            </p>
          ) : null}
        </>
      )}

      {result ? (
        <p data-testid="create-project-result" className="mt-2 text-sm">
          {result.text}
          {result.kind === "ok" ? (
            <>
              {" "}
              <Link
                href={props.editingProject ? `/projects/${props.editingProject.id}` : "/projects"}
                data-testid="go-to-projects"
                className="underline"
              >
                {props.editingProject ? "View the project" : "View it in Projects"}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <p data-testid="storage-note" className={NOTE_CLASS}>
        Projects are saved in this browser only, under the localStorage key parcel-crm.projects.v1.
        This deployment has no server database, so a project created here does not appear in another
        browser, another device, or a private window.
      </p>
    </section>
  );
}
