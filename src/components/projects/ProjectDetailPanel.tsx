"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadParcelData, type ParcelData } from "@/lib/parcelData";
import { computeProjectStats, contiguityLabel, type Project } from "@/lib/project";
import { findProject, resolveProjectParcelIds } from "@/lib/projectStore";
import { formatAcres, UNAVAILABLE_LABEL } from "@/lib/parcel";

const NOTE_CLASS = "mt-2 text-xs text-black/60 dark:text-white/60";

export default function ProjectDetailPanel({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [data, setData] = useState<ParcelData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProject(findProject(id));
      try {
        const loaded = await loadParcelData();
        if (cancelled) return;
        setData(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (failed) {
    return (
      <p className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        Could not load the parcel data file. Reload the page.
      </p>
    );
  }

  if (project === undefined || data === null) {
    return (
      <p className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        Loading Rock Island County parcels…
      </p>
    );
  }

  if (project === null) {
    return (
      <p
        data-testid="project-not-found"
        className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15"
      >
        No project with this id is saved in this browser. Projects are stored per browser, so a link
        created elsewhere will not resolve here.{" "}
        <Link href="/projects" className="underline">
          Back to projects
        </Link>
      </p>
    );
  }

  // A project saved before ISSUE-013 stores PINs; they resolve to ids here, on read only.
  const memberIds = resolveProjectParcelIds(project, data.idsByPin);
  const stats = computeProjectStats(memberIds, data.parcelsById, data.adjacency);

  function blockLabel(id: string): string {
    const blockIndex = stats.blocks.findIndex((block) => block.includes(id));
    return `Block ${blockIndex + 1}`;
  }

  return (
    <section data-testid="project-detail" className="mt-4">
      <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>

      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Combined acreage
          </dt>
          <dd data-testid="detail-acres">{formatAcres(stats.combinedAcres)}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Parcels
          </dt>
          <dd data-testid="detail-parcels">{stats.members.length}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Contiguity
          </dt>
          <dd data-testid="detail-blocks">{contiguityLabel(stats.blocks.length)}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Owners
          </dt>
          <dd data-testid="detail-owners">{stats.ownerCount}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Created
          </dt>
          <dd data-testid="detail-created">{project.createdAt.slice(0, 10)}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-black/55 uppercase dark:text-white/55">
            Updated
          </dt>
          <dd data-testid="detail-updated">{project.updatedAt.slice(0, 10)}</dd>
        </div>
      </dl>

      <p className="mt-3">
        <Link href={`/?project=${project.id}`} data-testid="detail-open-map" className="underline">
          Open on map
        </Link>
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
      <p data-testid="storage-note" className={NOTE_CLASS}>
        Projects are saved in this browser only, under the localStorage key parcel-crm.projects.v1.
        This deployment has no server database, so a project created here does not appear in another
        browser, another device, or a private window.
      </p>

      <table data-testid="detail-member-table" className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-black/10 pb-2 dark:border-white/15">PIN</th>
            <th className="border-b border-black/10 pb-2 dark:border-white/15">Owner</th>
            <th className="border-b border-black/10 pb-2 dark:border-white/15">Acreage</th>
            <th className="border-b border-black/10 pb-2 dark:border-white/15">Block</th>
          </tr>
        </thead>
        <tbody>
          {stats.members.map((parcel) => (
            <tr data-testid="detail-member-row" data-pin={parcel.pin} key={parcel.id}>
              <td
                data-testid="detail-member-pin"
                className="border-b border-black/5 py-2 font-mono dark:border-white/10"
              >
                {parcel.pin}
              </td>
              <td
                data-testid="detail-member-owner"
                className="border-b border-black/5 py-2 dark:border-white/10"
              >
                {parcel.owner.present ? parcel.owner.value : UNAVAILABLE_LABEL}
              </td>
              <td
                data-testid="detail-member-acres"
                className="border-b border-black/5 py-2 dark:border-white/10"
              >
                {parcel.acres.present ? formatAcres(parcel.acres.value) : UNAVAILABLE_LABEL}
              </td>
              <td
                data-testid="detail-member-block"
                className="border-b border-black/5 py-2 dark:border-white/10"
              >
                {blockLabel(parcel.id)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
