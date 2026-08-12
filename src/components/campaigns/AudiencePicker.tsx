"use client";

import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { toParcel, type RawParcelProperties } from "@/lib/parcel";
import { deriveOwners, type Owner } from "@/lib/owners";
import { destinationFor, type Provenance } from "@/lib/campaigns/contact";
import { MAX_AUDIENCE, readProjects } from "@/lib/campaigns/store";

type LoadState = "loading" | "error" | "ready";
type SelectedProject = { id: string; name: string };

const TOP_N = 50;
const DEFAULT_SELECTED_COUNT = 8;
const CAP_MESSAGE =
  "Simulation cap: 25 owners per campaign. This is a labelled demo simulation, not a bulk sender.";

function ProvenanceChip({
  label,
  value,
  provenance,
  title,
}: {
  label: string;
  value: string;
  provenance: Provenance;
  title: string;
}): ReactElement {
  return (
    <span
      data-provenance={provenance}
      title={title}
      className={
        provenance === "mocked"
          ? "text-amber-700 dark:text-amber-300"
          : "text-black/70 dark:text-white/70"
      }
    >
      {label}: {value}
    </span>
  );
}

/**
 * The only surface in the whole feature that fetches anything — every other campaigns
 * screen reads `localStorage` alone, because `createCampaigns` denormalises owner name,
 * destination and provenance onto each `Message`.
 */
export function AudiencePicker({
  onChange,
}: {
  onChange: (selected: Owner[], project: SelectedProject | null) => void;
}): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [owners, setOwners] = useState<Owner[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);
  const [search, setSearch] = useState("");
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");

  const projects = useMemo(() => readProjects(), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/rock-island-parcels.json")
      .then((res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json() as Promise<FeatureCollection<Geometry, RawParcelProperties>>;
      })
      .then((geojson) => {
        if (cancelled) return;
        const parcels = geojson.features.map((feature) =>
          toParcel(feature as Feature<Geometry, RawParcelProperties>),
        );
        const derived = deriveOwners(parcels);
        setOwners(derived);
        setSelectedKeys(new Set(derived.slice(0, DEFAULT_SELECTED_COUNT).map((o) => o.ownerKey)));
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedOwners = useMemo(
    () => owners.filter((o) => selectedKeys.has(o.ownerKey)),
    [owners, selectedKeys],
  );

  useEffect(() => {
    onChange(selectedOwners, selectedProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOwners, selectedProject]);

  const visibleOwners = useMemo(() => {
    if (search.trim() !== "") {
      const needle = search.trim().toLowerCase();
      return owners.filter((o) => o.ownerName.toLowerCase().includes(needle));
    }
    const top = owners.slice(0, TOP_N);
    const topKeys = new Set(top.map((o) => o.ownerKey));
    const extras = owners.filter((o) => selectedKeys.has(o.ownerKey) && !topKeys.has(o.ownerKey));
    return [...top, ...extras];
  }, [owners, search, selectedKeys]);

  function toggle(ownerKey: string) {
    setSelectedProject(null);
    setProjectId("");
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(ownerKey)) {
        next.delete(ownerKey);
        setCapMessage(null);
        return next;
      }
      if (next.size >= MAX_AUDIENCE) {
        setCapMessage(CAP_MESSAGE);
        return prev;
      }
      setCapMessage(null);
      next.add(ownerKey);
      return next;
    });
  }

  function handleProjectChange(id: string) {
    setProjectId(id);
    if (id === "") {
      setSelectedProject(null);
      return;
    }
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    const pinSet = new Set(project.parcelPins);
    const matched = owners
      .filter((o) => o.parcelPins.some((pin) => pinSet.has(pin)))
      .slice(0, MAX_AUDIENCE);
    setSelectedKeys(new Set(matched.map((o) => o.ownerKey)));
    setCapMessage(null);
    setSelectedProject({ id: project.id, name: project.name });
  }

  if (loadState === "loading") {
    return <p data-testid="audience-loading">Loading Rock Island County owner records…</p>;
  }
  if (loadState === "error") {
    return <p>Could not load the parcel data file. Reload the page.</p>;
  }

  const activeProject = projectId !== "" ? projects.find((p) => p.id === projectId) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex max-w-md flex-col gap-1 text-sm">
        Saved project
        <select
          data-testid="project-select"
          value={projectId}
          disabled={projects.length === 0}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="rounded-md border border-black/20 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/25"
        >
          {projects.length === 0 ? (
            <option value="">No saved projects yet — select owners manually.</option>
          ) : (
            <>
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </>
          )}
        </select>
      </label>
      {selectedProject !== null && activeProject !== undefined && (
        <p className="text-xs text-black/60 dark:text-white/60">
          Audience from project &quot;{activeProject.name}&quot; — {selectedOwners.length} distinct
          owners across {activeProject.parcelPins.length} parcels
        </p>
      )}

      <input
        type="text"
        data-testid="audience-search"
        placeholder="Search owners…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/25"
      />

      <p data-testid="audience-selected-count" className="text-sm font-medium">
        Selected ({selectedOwners.length})
      </p>
      {capMessage !== null && (
        <p className="text-xs text-red-700 dark:text-red-400">{capMessage}</p>
      )}

      <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
        {visibleOwners.map((owner) => {
          const email = destinationFor(owner, "email");
          const sms = destinationFor(owner, "sms");
          const mail = destinationFor(owner, "direct_mail");
          return (
            <li
              key={owner.ownerKey}
              data-testid="audience-row"
              data-owner-key={owner.ownerKey}
              className="flex flex-col gap-1 rounded-md border border-black/10 p-2 text-xs dark:border-white/15"
            >
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={selectedKeys.has(owner.ownerKey)}
                  onChange={() => toggle(owner.ownerKey)}
                />
                {owner.ownerName} — {owner.parcelCount} parcel{owner.parcelCount === 1 ? "" : "s"},{" "}
                {owner.totalAcres.toFixed(2)} ac
              </label>
              <div className="flex flex-wrap gap-3 pl-6 text-black/70 dark:text-white/70">
                <ProvenanceChip
                  label="Email"
                  value={email.mailable ? email.value : "—"}
                  provenance={email.provenance}
                  title={email.sourceLabel}
                />
                <ProvenanceChip
                  label="SMS"
                  value={sms.mailable ? sms.value : "—"}
                  provenance={sms.provenance}
                  title={sms.sourceLabel}
                />
                <ProvenanceChip
                  label="Mail"
                  value={mail.mailable ? mail.value : mail.reason}
                  provenance={mail.provenance}
                  title={mail.sourceLabel}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
