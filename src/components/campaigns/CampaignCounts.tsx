"use client";

import type { ReactElement } from "react";
import type { Counts } from "@/lib/campaigns/model";

/** The six primary figures, in the exact order the plan specifies. */
const FIGURES: {
  key: "messages" | "sent" | "delivered" | "clicked" | "replied" | "bounced";
  label: string;
}[] = [
  { key: "messages", label: "Messages" },
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "clicked", label: "Clicked" },
  { key: "replied", label: "Replied" },
  { key: "bounced", label: "Bounced" },
];

/**
 * The counts row every campaigns surface reuses. The `data-count-*` attributes on the
 * container mirror the raw numbers so the browser lane can compare them against a tally
 * of the message rows without scraping formatted text.
 */
export function CampaignCounts({ counts }: { counts: Counts }): ReactElement {
  return (
    <div
      data-testid="campaign-counts"
      data-count-messages={counts.messages}
      data-count-sent={counts.sent}
      data-count-delivered={counts.delivered}
      data-count-clicked={counts.clicked}
      data-count-replied={counts.replied}
      data-count-bounced={counts.bounced}
      className="flex flex-col gap-1.5 text-xs"
    >
      <div className="flex flex-wrap gap-3">
        {FIGURES.map((figure) => (
          <span key={figure.key} data-count={figure.key} className="font-medium">
            {figure.label}: {counts[figure.key]}
          </span>
        ))}
      </div>
      <p className="text-black/60 dark:text-white/60">
        Opened {counts.opened} · Logged in {counts.loggedIn} · Opted out {counts.optedOut}
      </p>
      <p className="text-black/50 dark:text-white/50">
        Each figure counts distinct messages that reached that event at least once, not the messages
        currently in that state. A clicked message is still counted as delivered. Once every message
        has left &quot;sent&quot;, delivered + bounced equals sent.
      </p>
    </div>
  );
}
