"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { formatAcres, toParcel, type Parcel, type RawParcelProperties } from "@/lib/parcel";
import {
  buildOwnerRecords,
  ownersWithoutName,
  type OwnerRecord as OwnerRecordType,
} from "@/lib/owners";
import {
  clearEnrichments,
  effectiveContact,
  readEnrichments,
  type EnrichmentStore,
} from "@/lib/store";
import type { ParcelMeta } from "@/lib/parcelData";
import OwnerRecord from "@/components/owners/OwnerRecord";

type CompletenessFilter = "all" | "complete" | "incomplete";

const PAGE_SIZE = 50;

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";
const PANEL_CLASS = "rounded-lg border border-black/10 p-4 text-sm dark:border-white/15";

const METHODOLOGY_NOTE =
  "Email and phone on this screen are generated, not real. They are derived deterministically " +
  "from the owner name, so the same owner always shows the same values. Emails use the reserved " +
  ".invalid domain and phone numbers use the NANP 555-0100–555-0199 block reserved for fictional " +
  "use, so neither can be contacted. Because that block holds only 100 numbers and there are " +
  "4,573 owners, phone numbers repeat across owners. No contact data was purchased, scraped, or " +
  "obtained from Rock Island County.";

export default function OwnersWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // useSearchParams() returns the already-decoded value — do not decodeURIComponent it again.
  const selectedKey = searchParams.get("owner");

  const [raw, setRaw] = useState<FeatureCollection | null>(null);
  const [meta, setMeta] = useState<ParcelMeta | null>(null);
  const [store, setStore] = useState<EnrichmentStore | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CompletenessFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [dataResponse, metaResponse] = await Promise.all([
          fetch("/data/rock-island-parcels.json"),
          fetch("/data/rock-island-parcels.meta.json"),
        ]);
        if (!dataResponse.ok || !metaResponse.ok) throw new Error("parcel data fetch failed");
        const collection = (await dataResponse.json()) as FeatureCollection;
        const metaJson = (await metaResponse.json()) as ParcelMeta;
        if (cancelled) return;
        setRaw(collection);
        setMeta(metaJson);
        // Never read localStorage during render — that would break hydration. Seeding it
        // here, once, after the client-only effect has run, is the safe point.
        setStore(readEnrichments());
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const parcels = useMemo<Parcel[] | null>(() => {
    if (!raw) return null;
    return raw.features.map((feature) =>
      toParcel(feature as Feature<Geometry, RawParcelProperties>),
    );
  }, [raw]);

  const owners = useMemo<OwnerRecordType[]>(
    () => (parcels ? buildOwnerRecords(parcels) : []),
    [parcels],
  );
  const noOwnerPins = useMemo<string[]>(
    () => (parcels ? ownersWithoutName(parcels) : []),
    [parcels],
  );

  const ownersWithContact = useMemo(() => {
    if (!store) return [];
    return owners.map((owner) => ({ owner, contact: effectiveContact(owner, store) }));
  }, [owners, store]);

  const completeCount = ownersWithContact.filter(
    (o) => o.contact.completeness === "complete",
  ).length;
  const incompleteCount = ownersWithContact.length - completeCount;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ownersWithContact.filter(({ owner, contact }) => {
      if (term && !owner.ownerKey.toLowerCase().includes(term)) return false;
      if (filter === "complete" && contact.completeness !== "complete") return false;
      if (filter === "incomplete" && contact.completeness !== "incomplete") return false;
      return true;
    });
  }, [ownersWithContact, search, filter]);

  const visibleRows = filtered.slice(0, visibleCount);

  const selectedOwner = useMemo(
    () => (selectedKey ? (owners.find((o) => o.ownerKey === selectedKey) ?? null) : null),
    [owners, selectedKey],
  );

  function selectOwner(ownerKey: string) {
    router.replace(`/owners?owner=${encodeURIComponent(ownerKey)}`, { scroll: false });
  }

  function handleReset() {
    setStore(clearEnrichments());
  }

  if (failed) {
    return (
      <p className={`mt-4 ${PANEL_CLASS}`}>Could not load the parcel data file. Reload the page.</p>
    );
  }

  if (!raw || !meta || !store) {
    return <p className={`mt-4 ${PANEL_CLASS}`}>Loading Rock Island County parcels…</p>;
  }

  return (
    <div data-testid="owners-workspace" className="mt-4 flex flex-col gap-4">
      <div data-testid="owners-summary" className={`${PANEL_CLASS} leading-relaxed`}>
        <p className="text-sm font-semibold">
          {owners.length.toLocaleString("en-US")} owner CRM records derived from{" "}
          {meta.parcelCount.toLocaleString("en-US")} loaded parcels.
        </p>
        <p className="text-black/60 dark:text-white/60">
          {completeCount.toLocaleString("en-US")} complete ·{" "}
          {incompleteCount.toLocaleString("en-US")} incomplete (simulated contact coverage).
        </p>
        <p className="text-black/60 dark:text-white/60">
          {noOwnerPins.length} of the {meta.parcelCount.toLocaleString("en-US")} loaded parcels have
          no owner name in the source and have no owner record: {noOwnerPins.join(", ")}.
        </p>
        <p className="text-black/60 dark:text-white/60">
          Owner identity is the county&apos;s owner1_name field, trimmed and otherwise verbatim.
          Names are not merged, re-cased, or corrected.
        </p>
        <p className="mt-2 text-xs text-black/45 dark:text-white/45">{METHODOLOGY_NOTE}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          data-testid="owner-search"
          placeholder="Search owner name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        />
        <button
          type="button"
          data-testid="owner-filter-all"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
          className={BUTTON_CLASS}
        >
          All
        </button>
        <button
          type="button"
          data-testid="owner-filter-complete"
          aria-pressed={filter === "complete"}
          onClick={() => setFilter("complete")}
          className={BUTTON_CLASS}
        >
          Complete
        </button>
        <button
          type="button"
          data-testid="owner-filter-incomplete"
          aria-pressed={filter === "incomplete"}
          onClick={() => setFilter("incomplete")}
          className={BUTTON_CLASS}
        >
          Incomplete
        </button>
        <button
          type="button"
          data-testid="reset-enrichments"
          onClick={handleReset}
          className={BUTTON_CLASS}
        >
          Reset simulated enrichments
        </button>
        {selectedKey ? (
          <button
            type="button"
            onClick={() => router.replace("/owners", { scroll: false })}
            className={BUTTON_CLASS}
          >
            Clear selection
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {visibleRows.map(({ owner, contact }) => (
              <li key={owner.ownerId}>
                <button
                  type="button"
                  data-testid="owner-row"
                  data-owner-id={owner.ownerId}
                  onClick={() => selectOwner(owner.ownerKey)}
                  className={`w-full rounded-lg border border-black/10 p-3 text-left text-sm dark:border-white/15 ${
                    selectedKey === owner.ownerKey ? "bg-black/5 dark:bg-white/10" : ""
                  }`}
                >
                  <span className="block font-medium">{owner.ownerKey}</span>
                  <span className="text-black/60 dark:text-white/60">
                    {owner.parcelCount} parcel{owner.parcelCount === 1 ? "" : "s"} ·{" "}
                    {formatAcres(owner.totalAcres)}
                  </span>{" "}
                  <span className="ml-1 rounded-sm border border-current px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
                    {contact.completeness === "complete" ? "Complete" : "Incomplete"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {visibleCount < filtered.length ? (
            <button
              type="button"
              data-testid="owners-show-more"
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className={BUTTON_CLASS}
            >
              Show 50 more
            </button>
          ) : null}
        </div>

        <div>
          {selectedOwner ? (
            <OwnerRecord owner={selectedOwner} store={store} onEnriched={setStore} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
