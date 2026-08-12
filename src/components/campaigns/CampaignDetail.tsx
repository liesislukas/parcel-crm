"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CHANNEL_LABEL, countsFrom } from "@/lib/campaigns/model";
import { advanceCampaign, getServerSnapshot, getSnapshot, subscribe } from "@/lib/campaigns/store";
import { CampaignCounts } from "./CampaignCounts";
import { MessageRow } from "./MessageRow";
import { SimulatedBadge, SimulationBanner } from "./SimulatedBadge";
import { SimulationControls } from "./SimulationControls";

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

const CREATED_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** `/campaigns/[campaignId]` — the screen where the lifecycle and the counts are watched. */
export function CampaignDetail({ campaignId }: { campaignId: string }): ReactElement {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const campaign = state.campaigns.find((c) => c.id === campaignId);

  if (!campaign) {
    return (
      <p data-testid="campaign-missing">
        This campaign is not in this browser&apos;s simulation. Campaigns live in this browser only
        — open <Link href="/campaigns">Campaigns</Link> and create one.
      </p>
    );
  }

  const messages = state.messages
    .filter((m) => m.campaignId === campaignId)
    .slice()
    .sort((a, b) => a.recipientIndex - b.recipientIndex);
  const messageIds = messages.map((m) => m.id);
  const facts = state.events
    .filter((e) => messageIds.includes(e.messageId))
    .map((e) => ({ messageId: e.messageId, factType: e.factType }));
  const counts = countsFrom(messageIds, facts);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Acquisition workflow
        </span>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {campaign.name} <SimulatedBadge />
        </h1>
        <p className="text-sm text-black/65 dark:text-white/65">
          {CHANNEL_LABEL[campaign.channel]}
          {campaign.projectName !== null ? ` · ${campaign.projectName}` : ""} · Created (simulated){" "}
          {CREATED_FORMAT.format(new Date(campaign.createdAtMs))}
        </p>
      </header>

      <SimulationBanner />

      <div className="flex flex-wrap items-center gap-3">
        <SimulationControls scope="all" />
        <button
          type="button"
          data-testid="advance-campaign"
          className={BUTTON_CLASS}
          onClick={() => advanceCampaign(campaignId, 1)}
        >
          Advance this campaign (+12 h)
        </button>
      </div>

      <CampaignCounts counts={counts} />

      <span data-testid="message-count" className="text-sm text-black/60 dark:text-white/60">
        {messages.length} messages
      </span>

      <ul data-testid="message-list" className="flex flex-col gap-3">
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            events={state.events.filter((e) => e.messageId === message.id)}
          />
        ))}
      </ul>

      <p data-testid="audience-label" className="text-sm text-black/60 dark:text-white/60">
        {campaign.audienceLabel}
      </p>
    </article>
  );
}
