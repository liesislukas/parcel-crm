"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import {
  CHANNEL_LABEL,
  FACT_LABEL,
  MAIL_DELIVERY_CAPTION,
  messageStateFrom,
  stateLabel,
} from "@/lib/campaigns/model";
import type { LifecycleEvent, Message } from "@/lib/campaigns/store";
import { SimulatedBadge } from "./SimulatedBadge";
import { FollowUpPanel } from "./FollowUpPanel";

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/**
 * One simulated message: its provenance-labelled recipient, its current state, its
 * always-visible short link (even after a bounce — that is what makes the dead-link
 * refusal in `/r/[token]` demonstrable), its full event timeline, and its follow-up
 * control.
 */
export function MessageRow({
  message,
  events,
}: {
  message: Message;
  events: LifecycleEvent[];
}): ReactElement {
  const state = messageStateFrom(events.map((e) => e.factType));

  return (
    <li
      data-testid="message-row"
      data-message-id={message.id}
      data-state={state}
      className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{message.ownerName}</span>
        <SimulatedBadge />
        <span className="text-black/60 dark:text-white/60">{CHANNEL_LABEL[message.channel]}</span>
      </div>

      <p>
        To:{" "}
        <span
          data-provenance={message.toProvenance}
          title={message.toSourceLabel}
          className={
            message.toProvenance === "mocked"
              ? "text-amber-700 dark:text-amber-300"
              : "text-black/70 dark:text-white/70"
          }
        >
          {message.toValue || "—"} ·{" "}
          {message.toProvenance === "mocked" ? "Mocked" : "Rock Island County GIS"}
        </span>
      </p>

      <p>
        State: <span data-testid="message-state">{stateLabel(message.channel, state)}</span>
      </p>

      {message.followUpOfMessageId !== null && (
        <p className="text-black/60 dark:text-white/60">
          Follow-up to an earlier message · {message.followUpNote}
        </p>
      )}

      <details data-testid="message-body">
        <summary className="cursor-pointer">Show the simulated message</summary>
        {message.subject !== null && <p className="mt-1 font-medium">{message.subject}</p>}
        <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-black/80 dark:text-white/80">
          {message.body}
        </pre>
      </details>

      <p className="flex flex-wrap items-center gap-2">
        <Link data-testid="short-link" href={`/r/${message.shortUrlToken}`} className="underline">
          Open the simulated short link
        </Link>
        <span className="text-xs text-black/50 dark:text-white/50">
          https://ri.invalid/r/{message.shortUrlToken}
        </span>
      </p>

      <ol data-testid="message-timeline" className="flex flex-col gap-1 text-xs">
        {events.map((e) => (
          <li key={e.eventIdentifier} data-fact={e.factType} className="flex flex-col">
            <span>
              {FACT_LABEL[message.channel][e.factType] ?? e.factType} —{" "}
              {TIMESTAMP_FORMAT.format(new Date(e.effectiveAt))} ·{" "}
              {e.origin === "scheduler" ? "simulated schedule" : "recorded in your browser"}
              {e.detail !== null ? ` · ${e.detail}` : ""}
            </span>
            {e.factType === "message.delivered" && message.channel === "direct_mail" && (
              <span className="text-black/50 dark:text-white/50">{MAIL_DELIVERY_CAPTION}</span>
            )}
          </li>
        ))}
      </ol>

      <FollowUpPanel message={message} parentState={state} />
    </li>
  );
}
