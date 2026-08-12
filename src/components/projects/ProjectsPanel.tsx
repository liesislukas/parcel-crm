"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadParcelData, type ParcelData } from "@/lib/parcelData";
import { computeProjectStats, contiguityLabel, type Project } from "@/lib/project";
import { deleteProject, loadProjects } from "@/lib/projectStore";
import { formatAcres } from "@/lib/parcel";

const NOTE_CLASS = "mt-2 text-xs text-black/60 dark:text-white/60";

export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [data, setData] = useState<ParcelData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Reading storage synchronously here (not during render) is what keeps SSR and
      // hydration correct.
      setProjects(loadProjects());
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
  }, []);

  function handleDelete(project: Project) {
    const ok = window.confirm(`Delete project “${project.name}”? This cannot be undone.`);
    if (!ok) return;
    deleteProject(project.id);
    setProjects(loadProjects());
  }

  if (failed) {
    return (
      <p className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        Could not load the parcel data file. Reload the page.
      </p>
    );
  }

  if (projects === null || data === null) {
    return (
      <p className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        Loading Rock Island County parcels…
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p data-testid="storage-note" className={NOTE_CLASS}>
        Projects are saved in this browser only, under the localStorage key parcel-crm.projects.v1.
        This deployment has no server database, so a project created here does not appear in another
        browser, another device, or a private window.
      </p>

      {projects.length === 0 ? (
        <p
          data-testid="projects-empty"
          className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15"
        >
          No projects yet. Open the map, select the parcels you want to assemble, name the group,
          and create a project.{" "}
          <Link href="/" className="underline">
            Go to the map
          </Link>
        </p>
      ) : (
        <table data-testid="projects-table" className="mt-4 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Project</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Parcels</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">
                Combined acreage
              </th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Contiguity</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Owners</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Created</th>
              <th className="border-b border-black/10 pb-2 dark:border-white/15">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const stats = computeProjectStats(project.pins, data.parcelsByPin, data.adjacency);
              return (
                <tr data-testid="project-row" data-project-id={project.id} key={project.id}>
                  <td className="border-b border-black/5 py-2 dark:border-white/10">
                    <Link
                      href={`/projects/${project.id}`}
                      data-testid="project-row-name"
                      className="underline"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td
                    data-testid="project-row-parcels"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {stats.members.length}
                  </td>
                  <td
                    data-testid="project-row-acres"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {formatAcres(stats.combinedAcres)}
                  </td>
                  <td
                    data-testid="project-row-blocks"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {contiguityLabel(stats.blocks.length)}
                  </td>
                  <td
                    data-testid="project-row-owners"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {stats.ownerCount}
                  </td>
                  <td
                    data-testid="project-row-created"
                    className="border-b border-black/5 py-2 dark:border-white/10"
                  >
                    {project.createdAt.slice(0, 10)}
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
                      onClick={() => handleDelete(project)}
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
