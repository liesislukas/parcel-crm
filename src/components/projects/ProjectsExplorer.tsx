"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  applyFilters,
  parseFilterState,
  toSearchParams,
  ACQUISITION_STAGE_LABELS,
  COUNTY_LABEL,
  OUTREACH_STATUS_LABELS,
  type DimensionKey,
  type FilterableProject,
} from "@/lib/projectFilters";
import {
  loadCrmStores,
  loadSourceProjects,
  needsParcelLookup,
  toFilterableProject,
  type CrmStores,
  type ParcelLookup,
  type SourceProject,
} from "@/lib/filterableProject";
import { formatPowerAccess } from "@/lib/powerAccess";
import { formatAcres, type FieldState } from "@/lib/parcel";
import { computeProjectStats, contiguityLabel } from "@/lib/project";
import { deleteProject } from "@/lib/projectStore";
import { loadParcelData } from "@/lib/parcelData";
import { toPowerFeature, type PowerFeature, type RawPowerProperties } from "@/lib/power";
import { DemoDataNotice } from "@/components/demo/DemoDataNotice";
import { ensureDemoSeed } from "@/lib/demo/ensureSeed";
import ProjectFilterBar from "./ProjectFilterBar";

const NOTE_CLASS = "mt-2 text-xs text-black/60 dark:text-white/60";
const BOX_CLASS = "mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15";

// Copied verbatim from src/components/crm/PipelineTable.tsx lines 21-23 so the SEEDED badge
// is pixel-identical across the acquisitions pipeline, /projects and /campaigns.
const BADGE_CLASS = "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
const SEEDED_BADGE_CLASS = `${BADGE_CLASS} bg-black/[.06] text-black/55 dark:bg-white/[.10] dark:text-white/55`;
const SEEDED_BADGE_TITLE = "Seeded demo record — not entered by a user of this deployment";

// Work item 0: `src/app/projects/[id]/page.tsx` exists on this base commit — confirmed by
// `ls src/app/projects`, which lists `[id]/page.tsx` alongside `page.tsx`.
const HAS_PROJECT_DETAIL_ROUTE = true;

const UNKNOWN_NOTE_COPY: Record<DimensionKey, (n: number) => string> = {
  county: (n) => `${n} projects hidden: county unknown for this project.`,
  acres: (n) => `${n} projects hidden: no source acreage on any member parcel.`,
  power: (n) =>
    `${n} projects hidden: power access unknown. Tick "Include projects with unknown power access" to show them.`,
  outreach: (n) => `${n} projects hidden: no outreach status recorded.`,
  stage: (n) => `${n} projects hidden: no acquisition stage recorded.`,
};

function fieldStateAttr(field: FieldState<unknown>): { "data-field-state"?: "missing" } {
  return field.present ? {} : { "data-field-state": "missing" };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Member parcel ids for a raw stored record. v2 projects store ids; projects saved before
 * ISSUE-013 store PINs, which map through `idsByPin` — a colliding PIN contributes every
 * record it names, matching `resolveProjectParcelIds`.
 */
function rawMemberIds(project: SourceProject, lookup: ParcelLookup): string[] | null {
  if (isStringArray(project.parcelIds)) return project.parcelIds;

  const pins = isStringArray(project.pins)
    ? project.pins
    : isStringArray(project.parcelPins)
      ? project.parcelPins
      : null;
  if (pins === null) return null;
  if (lookup === null) return [];

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const pin of pins) {
    for (const id of lookup.idsByPin.get(pin) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      resolved.push(id);
    }
  }
  return resolved;
}

export default function ProjectsExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useMemo(
    () => parseFilterState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [sourceProjects, setSourceProjects] = useState<SourceProject[] | null>(null);
  const [crmStores, setCrmStores] = useState<CrmStores | null>(null);
  const [parcelLookup, setParcelLookup] = useState<ParcelLookup>(null);
  const [powerFeatures, setPowerFeatures] = useState<PowerFeature[] | null>(null);
  const [parcelLoadFailed, setParcelLoadFailed] = useState(false);
  const [countyNote, setCountyNote] = useState(`${COUNTY_LABEL} is the only county in this build.`);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Idempotent — a no-op once DemoSeedBoot (mounted in the root layout) has already run.
      // Called here too so this explorer's own read never races DemoSeedBoot's sibling effect.
      await ensureDemoSeed();

      // Reading storage synchronously here (not during render) is what keeps SSR and
      // hydration correct — the same discipline ISSUE-004's ProjectsPanel used.
      const raw = loadSourceProjects();
      if (cancelled) return;
      setSourceProjects(raw);
      setCrmStores(loadCrmStores());

      try {
        const metaResponse = await fetch("/data/rock-island-parcels.meta.json");
        if (!cancelled && metaResponse.ok) {
          const meta = (await metaResponse.json()) as {
            parcelCount: number;
            countyParcelCount: number;
            sourceOrg: string;
          };
          setCountyNote(
            `${COUNTY_LABEL} is the only county in this build — ${meta.parcelCount.toLocaleString("en-US")} of ${meta.countyParcelCount.toLocaleString("en-US")} county parcels are loaded from ${meta.sourceOrg}. The filter is shown because the acceptance criterion asks for it.`,
          );
        }
      } catch {
        // Fallback copy set above stands.
      }

      if (!needsParcelLookup(raw)) return;

      try {
        const [parcelData, powerResponse] = await Promise.all([
          loadParcelData(),
          fetch("/data/rock-island-power.json"),
        ]);
        if (cancelled) return;
        setParcelLookup({
          parcelsById: new Map(parcelData.parcelsById),
          idsByPin: new Map(parcelData.idsByPin),
          adjacency: parcelData.adjacency,
        });
        if (powerResponse.ok) {
          const collection = (await powerResponse.json()) as FeatureCollection;
          const mapped = collection.features.map((f) =>
            toPowerFeature(f as Feature<Geometry, RawPowerProperties>),
          );
          if (!cancelled) setPowerFeatures(mapped);
        }
        // A power-fetch failure never blocks the parcel-derived acreage figures — power
        // access simply stays Unknown for every project, which is the honest answer.
      } catch {
        if (!cancelled) setParcelLoadFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const rawById = useMemo(() => {
    const map = new Map<string, SourceProject>();
    if (sourceProjects === null) return map;
    for (const p of sourceProjects) {
      const id =
        typeof p.id === "string" ? p.id : typeof p.projectId === "string" ? p.projectId : null;
      if (id !== null) map.set(id, p);
    }
    return map;
  }, [sourceProjects]);

  const filterableProjects = useMemo(() => {
    if (sourceProjects === null || crmStores === null) return null;
    return sourceProjects
      .map((p) =>
        toFilterableProject(p, parcelLookup, HAS_PROJECT_DETAIL_ROUTE, crmStores, powerFeatures),
      )
      .filter((p): p is FilterableProject => p !== null);
  }, [sourceProjects, crmStores, parcelLookup, powerFeatures]);

  function handleDelete(id: string, name: string) {
    const ok = window.confirm(`Delete project "${name}"? This cannot be undone.`);
    if (!ok) return;
    deleteProject(id);
    setSourceProjects(loadSourceProjects());
  }

  if (parcelLoadFailed) {
    return <p className={BOX_CLASS}>Could not load the parcel data file. Reload the page.</p>;
  }

  if (filterableProjects === null) {
    return <p className={BOX_CLASS}>Loading Rock Island County parcels…</p>;
  }

  const outcome = applyFilters(filterableProjects, state);
  const unknownEntries = (Object.keys(UNKNOWN_NOTE_COPY) as DimensionKey[]).filter(
    (dim) => outcome.hiddenAsUnknown[dim] > 0,
  );

  return (
    <div data-testid="projects-explorer" className="mt-4">
      <p data-testid="storage-note" className={NOTE_CLASS}>
        Projects are saved in this browser only, under the localStorage key parcel-crm.projects.v1.
        This deployment has no server database, so a project created here does not appear in another
        browser, another device, or a private window.
      </p>

      <div className="mt-4">
        <DemoDataNotice surface="projects" />
      </div>

      <div className="mt-4">
        <ProjectFilterBar
          state={state}
          onChange={(next) => {
            const qs = toSearchParams(next).toString();
            router.replace(qs === "" ? "/projects" : `/projects?${qs}`, { scroll: false });
          }}
          countyNote={countyNote}
        />
      </div>

      <p data-testid="filter-result-count" className="mt-4 text-sm font-medium">
        Showing {outcome.matched.length} of {outcome.total} projects
      </p>

      {(unknownEntries.length > 0 || outcome.unrecognisedStages.length > 0) && (
        <ul data-testid="filter-unknown-notes" className={NOTE_CLASS}>
          {unknownEntries.map((dim) => (
            <li key={dim} data-testid={`filter-unknown-${dim}`}>
              {UNKNOWN_NOTE_COPY[dim](outcome.hiddenAsUnknown[dim])}
            </li>
          ))}
          {outcome.unrecognisedStages.length > 0 && (
            <li data-testid="filter-unknown-rawstage">
              {`${outcome.unrecognisedStages.length} projects carry an acquisition stage this filter does not recognise: ${outcome.unrecognisedStages.join(", ")}.`}
            </li>
          )}
        </ul>
      )}

      {outcome.total === 0 ? (
        <p data-testid="projects-none-created" className={BOX_CLASS}>
          No projects yet. Create a project from a map selection on the Map page, then filter it
          here.{" "}
          <Link href="/" className="underline">
            Open the map
          </Link>
        </p>
      ) : outcome.matched.length === 0 ? (
        <p data-testid="projects-empty" className={BOX_CLASS}>
          No projects match these filters. {outcome.total} projects exist. Widen the acreage range,
          or clear the filters to see them all.
        </p>
      ) : (
        <table data-testid="projects-table" className="mt-4 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Project</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">County</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">
                Combined acreage
              </th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Power access</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Outreach</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Stage</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Parcels</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Contiguity</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Owners</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Created</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Actions</th>
            </tr>
          </thead>
          <tbody>
            {outcome.matched.map((project) => {
              const raw = rawById.get(project.id);
              const memberIds = raw ? rawMemberIds(raw, parcelLookup) : null;
              const stats =
                memberIds !== null && parcelLookup !== null
                  ? computeProjectStats(memberIds, parcelLookup.parcelsById, parcelLookup.adjacency)
                  : null;
              const createdAt =
                raw && typeof raw.createdAt === "string"
                  ? raw.createdAt.slice(0, 10)
                  : "Not available";

              return (
                <tr data-testid="project-row" data-project-id={project.id} key={project.id}>
                  <td className="border-b border-black/5 py-2 dark:border-white/10">
                    {project.href ? (
                      <Link
                        href={project.href}
                        data-testid="project-row-name"
                        className="underline"
                      >
                        {project.name}
                      </Link>
                    ) : (
                      <span data-testid="project-row-name">{project.name}</span>
                    )}
                    {raw?.seeded === true && (
                      <span
                        data-testid="project-seeded-badge"
                        className={`ml-1.5 ${SEEDED_BADGE_CLASS}`}
                        title={SEEDED_BADGE_TITLE}
                      >
                        SEEDED
                      </span>
                    )}
                  </td>
                  <td
                    data-testid="project-county"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                    {...fieldStateAttr(project.county)}
                  >
                    {project.county.present ? COUNTY_LABEL : "County unknown"}
                  </td>
                  <td
                    data-testid="project-row-acres"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                    {...fieldStateAttr(project.acres)}
                  >
                    {project.acres.present
                      ? formatAcres(project.acres.value)
                      : "Acreage not available"}
                    {project.acresParcelsWithSource < project.acresParcelsTotal && (
                      <span data-testid="project-acres-partial" className="ml-2 text-xs italic">
                        Partial — {project.acresParcelsWithSource} of {project.acresParcelsTotal}{" "}
                        member parcels have source acreage
                      </span>
                    )}
                  </td>
                  <td
                    data-testid="project-power"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                    {...fieldStateAttr(project.powerNearestMiles)}
                  >
                    {formatPowerAccess(project.powerNearestMiles)}
                  </td>
                  <td
                    data-testid="project-outreach"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                    {...fieldStateAttr(project.outreachStatus)}
                  >
                    {project.outreachStatus.present
                      ? OUTREACH_STATUS_LABELS[project.outreachStatus.value]
                      : "Outreach status unknown"}
                  </td>
                  <td
                    data-testid="project-stage"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                    {...fieldStateAttr(project.acquisitionStage)}
                  >
                    {project.acquisitionStage.present
                      ? ACQUISITION_STAGE_LABELS[project.acquisitionStage.value]
                      : "Acquisition stage unknown"}
                    {project.rawStage !== null && ` (source value: ${project.rawStage})`}
                  </td>
                  <td
                    data-testid="project-row-parcels"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {stats ? stats.members.length : "Not available"}
                  </td>
                  <td
                    data-testid="project-row-blocks"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {stats ? contiguityLabel(stats.blocks.length) : "Not available"}
                  </td>
                  <td
                    data-testid="project-row-owners"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {stats ? stats.ownerCount : "Not available"}
                  </td>
                  <td
                    data-testid="project-row-created"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {createdAt}
                  </td>
                  <td className="border-b border-black/5 py-2 dark:border-white/10">
                    <Link
                      href={`/?project=${project.id}`}
                      data-testid="project-open-map"
                      className="underline"
                    >
                      Open on map
                    </Link>{" "}
                    <button
                      type="button"
                      data-testid="project-delete"
                      onClick={() => handleDelete(project.id, project.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p data-testid="acreage-method" className={NOTE_CLASS}>
        Combined acreage sums the county&apos;s GIS_acres_num for each distinct parcel outline in
        the group. Row figures are rounded to two decimals for display; the total is computed from
        the unrounded county values.
      </p>
    </div>
  );
}
