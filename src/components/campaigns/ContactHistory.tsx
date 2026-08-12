"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CHANNEL_LABEL, FACT_LABEL } from "@/lib/campaigns/model";
import { getServerSnapshot, getSnapshot, ownerHistory, subscribe } from "@/lib/campaigns/store";
import { SimulatedBadge, SimulationBanner } from "./SimulatedBadge";

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const CHANNEL_ORDER: ("email" | "sms" | "direct_mail")[] = ["email", "sms", "direct_mail"];

/**
 * `/campaigns/history/[ownerKey]` — every simulated touch for one owner, across every
 * channel and every campaign, in order. Every value is denormalised onto the stored
 * messages, so this page never fetches the parcel file.
 */
export function ContactHistory({ ownerKey }: { ownerKey: string }): ReactElement {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const entries = ownerHistory(state, ownerKey);

  const ownerMessages = state.messages.filter((m) => m.ownerKey === ownerKey);
  const firstMessage = ownerMessages[0];

  if (!firstMessage) {
    return (
      <div className="flex flex-col gap-3">
        <p data-testid="history-empty">No simulated contact yet for this owner in this browser.</p>
        <Link href="/campaigns">Back to Campaigns</Link>
      </div>
    );
  }

  const campaignIds = new Set(ownerMessages.map((m) => m.campaignId));
  const channels = new Set(ownerMessages.map((m) => m.channel));
  const messageById = new Map(state.messages.map((m) => [m.id, m]));
  const campaignById = new Map(state.campaigns.map((c) => [c.id, c]));

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Acquisition workflow
        </span>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Contact history — {firstMessage.ownerName} <SimulatedBadge />
        </h1>
        <p data-testid="history-summary" className="text-sm text-black/65 dark:text-white/65">
          {entries.length} simulated touches across {campaignIds.size} campaigns and{" "}
          {channels.size} channels
        </p>
      </header>

      <SimulationBanner />

      <section className="flex flex-col gap-1.5 text-sm">
        {CHANNEL_ORDER.map((channel) => {
          const msg = ownerMessages.find((m) => m.channel === channel);
          return (
            <p key={channel}>
              {CHANNEL_LABEL[channel]}:{" "}
              {msg ? (
                <span
                  data-provenance={msg.toProvenance}
                  title={msg.toSourceLabel}
                  className={
                    msg.toProvenance === "mocked"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-black/70 dark:text-white/70"
                  }
                >
                  {msg.toValue || "—"}
                </span>
              ) : (
                <span className="text-black/50 dark:text-white/50">
                  No message on this channel yet.
                </span>
              )}
            </p>
          );
        })}
      </section>

      <ol data-testid="history-list" className="flex flex-col gap-2 text-sm">
        {entries.map((e) => {
          const message = messageById.get(e.messageId);
          if (!message) return null;
          const campaign = campaignById.get(message.campaignId);
          return (
            <li
              key={e.eventIdentifier}
              data-testid="history-entry"
              data-channel={message.channel}
              data-fact={e.factType}
              className="rounded-md border border-black/10 p-2 dark:border-white/15"
            >
              <p>
                {TIMESTAMP_FORMAT.format(new Date(e.effectiveAt))} · {CHANNEL_LABEL[message.channel]}{" "}
                · {FACT_LABEL[message.channel][e.factType] ?? e.factType} ·{" "}
                {campaign ? (
                  <Link href={`/campaigns/${campaign.id}`} className="underline">
                    {campaign.name}
                  </Link>
                ) : (
                  "Unknown campaign"
                )}{" "}
                · {e.origin === "scheduler" ? "simulated schedule" : "recorded in your browser"}
                {e.detail !== null ? ` · ${e.detail}` : ""}
              </p>
              {message.followUpOfMessageId !== null && (
                <p className="text-xs text-black/60 dark:text-white/60">
                  Follow-up · {message.followUpNote}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </article>
  );
}
