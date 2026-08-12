"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CHANNEL_LABEL, countsFrom } from "@/lib/campaigns/model";
import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/campaigns/store";
import { DemoDataNotice } from "@/components/demo/DemoDataNotice";
import { ensureDemoSeed } from "@/lib/demo/ensureSeed";
import { readManifest } from "@/lib/demo/manifest";
import { CampaignCounts } from "./CampaignCounts";
import { SimulatedBadge, SimulationBanner } from "./SimulatedBadge";
import { SimulationControls } from "./SimulationControls";

const PRIMARY_BUTTON_CLASS =
  "rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm font-medium dark:border-white/25 dark:bg-white/10";

// Copied verbatim from src/components/crm/PipelineTable.tsx lines 21-23, same as W9's
// project-row badge — pixel-identical SEEDED styling across every surface.
const BADGE_CLASS = "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
const SEEDED_BADGE_CLASS = `${BADGE_CLASS} bg-black/[.06] text-black/55 dark:bg-white/[.10] dark:text-white/55`;
const SEEDED_BADGE_TITLE = "Seeded demo record — not entered by a user of this deployment";

/** `/campaigns` — the index: the banner, the controls, the campaign list with counts, and the per-owner contact-history directory. */
export function CampaignsWorkspace(): ReactElement {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Seeded-ness is read from the demo-seed manifest, not from a new field on `Campaign` —
  // the campaigns store's shape and version stay untouched.
  //
  // Deviation from the plan: a bare `useEffect(() => setSeededIds(readManifest()...), [])`
  // both trips this repo's `react-hooks/set-state-in-effect` lint rule AND races
  // `ensureDemoSeed`'s own campaign-creation commit — that commit forces a synchronous
  // re-render of this component (it is subscribed to the campaign store) BEFORE
  // `ensureDemoSeed` reaches its final `writeManifest` call, so a naive read here can
  // permanently observe an empty manifest. Awaiting `ensureDemoSeed()` (idempotent; see its
  // own doc comment) before reading guarantees the manifest is fully written first — the
  // same "await, then read" idiom `ProjectsExplorer.tsx`'s own load effect already uses.
  const [seededIds, setSeededIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function loadSeededIds() {
      await ensureDemoSeed();
      if (cancelled) return;
      setSeededIds(readManifest()?.campaignIds ?? []);
    }
    void loadSeededIds();
    return () => {
      cancelled = true;
    };
  }, []);

  const ownerKeys = Array.from(new Set(state.messages.map((m) => m.ownerKey)));

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Acquisition workflow
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-black/65 dark:text-white/65">
          Simulated outreach to owners over email, direct mail, and SMS. Nothing is ever actually
          sent.
        </p>
      </header>

      <SimulationBanner />

      <DemoDataNotice surface="campaigns" />

      <div className="flex flex-wrap items-center gap-3">
        <Link data-testid="new-campaign" href="/campaigns/new" className={PRIMARY_BUTTON_CLASS}>
          New campaign
        </Link>
        <SimulationControls scope="all" />
      </div>

      {state.campaigns.length === 0 ? (
        <p data-testid="no-campaigns">
          No simulated campaigns yet. Create one — campaigns live in this browser only, so every
          demo starts clean.
        </p>
      ) : (
        <ul data-testid="campaign-list" className="flex flex-col gap-3">
          {state.campaigns.map((campaign) => {
            const messages = state.messages.filter((m) => m.campaignId === campaign.id);
            const messageIds = messages.map((m) => m.id);
            const facts = state.events
              .filter((e) => messageIds.includes(e.messageId))
              .map((e) => ({ messageId: e.messageId, factType: e.factType }));
            const counts = countsFrom(messageIds, facts);

            return (
              <li
                key={campaign.id}
                data-testid="campaign-card"
                data-campaign-id={campaign.id}
                data-channel={campaign.channel}
                className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{campaign.name}</span>
                  <SimulatedBadge />
                  {seededIds.includes(campaign.id) && (
                    <span
                      data-testid="campaign-seeded-badge"
                      className={SEEDED_BADGE_CLASS}
                      title={SEEDED_BADGE_TITLE}
                    >
                      SEEDED
                    </span>
                  )}
                  <span className="text-black/60 dark:text-white/60">
                    {CHANNEL_LABEL[campaign.channel]}
                  </span>
                  <span className="text-black/60 dark:text-white/60">Tick T+{campaign.tick}</span>
                </div>
                <p className="text-xs text-black/60 dark:text-white/60">{campaign.audienceLabel}</p>
                <CampaignCounts counts={counts} />
                <Link href={`/campaigns/${campaign.id}`} className="underline">
                  Open campaign
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section data-testid="owner-directory" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Owners contacted (simulated)</h2>
        {ownerKeys.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No owners contacted yet in this browser.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {ownerKeys.map((ownerKey) => {
              const ownerMessages = state.messages.filter((m) => m.ownerKey === ownerKey);
              const ownerName = ownerMessages[0]?.ownerName ?? ownerKey;
              const touches = state.events.filter((e) =>
                ownerMessages.some((m) => m.id === e.messageId),
              ).length;
              const channels = Array.from(new Set(ownerMessages.map((m) => m.channel)));

              return (
                <li key={ownerKey} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{ownerName}</span>
                  <span className="text-black/60 dark:text-white/60">
                    {touches} touch{touches === 1 ? "" : "es"} ·{" "}
                    {channels.map((c) => CHANNEL_LABEL[c]).join(", ")}
                  </span>
                  <Link
                    data-testid="owner-history-link"
                    href={`/campaigns/history/${ownerKey}`}
                    className="underline"
                  >
                    Contact history
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </article>
  );
}
