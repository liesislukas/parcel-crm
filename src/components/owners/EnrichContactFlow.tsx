"use client";

import { useEffect, useRef, useState } from "react";
import type { OwnerRecord as OwnerRecordType } from "@/lib/owners";
import {
  ENRICHMENT_LATENCY_MS,
  ENRICHMENT_PRICE_USD,
  type EffectiveContact,
  type EnrichmentEvent,
  type EnrichmentStore,
  missingFields,
  SIMULATED_VENDOR,
  writeEnrichment,
} from "@/lib/store";

type FlowState = "idle" | "confirming" | "purchasing" | "done";

const PANEL_CLASS = "rounded-lg border border-black/10 p-3 text-sm dark:border-white/15";
const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";
const MOCKED_BADGE_CLASS =
  "rounded-sm border border-current px-1.5 py-0.5 text-[9px] tracking-wide uppercase";

const CONFIRM_BODY =
  "This is a simulated purchase. No payment is taken, no external data vendor is called, and no " +
  "real contact details are retrieved. Confirming fills this record with generated placeholder " +
  "contact data, labelled MOCKED.";

type EnrichContactFlowProps = {
  owner: OwnerRecordType;
  contact: EffectiveContact;
  onEnriched: (s: EnrichmentStore) => void;
};

export default function EnrichContactFlow({ owner, contact, onEnriched }: EnrichContactFlowProps) {
  const [state, setState] = useState<FlowState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  // A complete-from-the-start owner is the demo's "if complete → proceed" branch — no
  // purchase is offered.
  if (contact.completeness === "complete" && contact.enrichedBy === null) {
    return null;
  }

  const missing = missingFields(owner.coverage);

  function handleConfirm() {
    setState("purchasing");
    timerRef.current = setTimeout(() => {
      const event: EnrichmentEvent = {
        ownerKey: owner.ownerKey,
        enrichedAt: new Date().toISOString(), // the ONLY Date call in this feature
        fieldsAdded: missingFields(owner.coverage),
        vendor: SIMULATED_VENDOR,
        priceUsd: ENRICHMENT_PRICE_USD,
        simulated: true,
      };
      const nextStore = writeEnrichment(event);
      onEnriched(nextStore);
      setState("done");
    }, ENRICHMENT_LATENCY_MS);
  }

  function handleCancel() {
    setState("idle");
  }

  if (contact.enrichedBy !== null || state === "done") {
    const event = contact.enrichedBy;
    return (
      <div data-testid="enrichment-history" className={PANEL_CLASS}>
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-black/55 uppercase dark:text-white/55">
            Enrichment history
          </h3>
          <span className={MOCKED_BADGE_CLASS}>MOCKED</span>
        </div>
        {event ? (
          <p className="mt-1 text-black/70 dark:text-white/70">
            Simulated enrichment — {event.fieldsAdded.join(", ")} added on{" "}
            {event.enrichedAt.slice(0, 10)} · $4.00 (no payment taken) · {event.vendor}
          </p>
        ) : null}
      </div>
    );
  }

  if (state === "purchasing") {
    return (
      <div
        data-testid="enrich-status"
        aria-live="polite"
        aria-busy="true"
        className={PANEL_CLASS}
      >
        Contacting simulated contact-data vendor…
      </div>
    );
  }

  if (state === "confirming") {
    return (
      <div className={PANEL_CLASS}>
        <h3 className="text-sm font-semibold">Simulated purchase</h3>
        <p className="mt-1 text-black/70 dark:text-white/70">{CONFIRM_BODY}</p>
        <p className="mt-2 text-black/70 dark:text-white/70">
          Fields to be added: {missing.join(", ")}
        </p>
        <p className="text-black/70 dark:text-white/70">Vendor: {SIMULATED_VENDOR}</p>
        <p className="text-black/70 dark:text-white/70">Price: $4.00 — no payment is taken.</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="enrich-confirm"
            onClick={handleConfirm}
            className={BUTTON_CLASS}
          >
            Confirm simulated purchase
          </button>
          <button
            type="button"
            data-testid="enrich-cancel"
            onClick={handleCancel}
            className={BUTTON_CLASS}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // state === "idle"
  return (
    <div className={PANEL_CLASS}>
      <button
        type="button"
        data-testid="enrich-start"
        onClick={() => setState("confirming")}
        className={BUTTON_CLASS}
      >
        Buy contact information — $4.00 (simulated)
      </button>
      <p className="mt-1 text-black/60 dark:text-white/60">Missing: {missing.join(" and ")}.</p>
    </div>
  );
}
