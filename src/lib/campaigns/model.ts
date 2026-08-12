/**
 * The vocabulary every other campaigns module depends on: channels, the event/fact
 * taxonomy, the message state machine, and the campaign counts fold. This module is
 * pure — no React, no DOM, no storage access, no `fetch`, no `Date`.
 */

export type Channel = "email" | "sms" | "direct_mail";

export const CHANNELS: Channel[] = ["email", "sms", "direct_mail"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
  direct_mail: "Direct mail",
};

export type FactType =
  | "message.queued"
  | "message.sent"
  | "message.delivered"
  | "message.opened"
  | "short_url.visited"
  | "portal.logged_in"
  | "message.replied"
  | "message.bounced"
  | "message.opted_out"
  | "followup.scheduled";

export type MessageState =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "logged_in"
  | "replied"
  | "bounced"
  | "opted_out";

export const FACT_LABEL: Record<Channel, Partial<Record<FactType, string>>> = {
  email: {
    "message.queued": "Queued",
    "message.sent": "Sent",
    "message.delivered": "Delivered",
    "message.opened": "Opened",
    "short_url.visited": "Short link clicked",
    "portal.logged_in": "Logged into the application",
    "message.replied": "Replied",
    "message.bounced": "Bounced",
    "message.opted_out": "Unsubscribed",
    "followup.scheduled": "Follow-up scheduled",
  },
  sms: {
    "message.queued": "Queued",
    "message.sent": "Sent",
    "message.delivered": "Delivered",
    "short_url.visited": "Short link clicked",
    "portal.logged_in": "Logged into the application",
    "message.replied": "Replied",
    "message.bounced": "Carrier rejected",
    "message.opted_out": "Replied STOP",
    "followup.scheduled": "Follow-up scheduled",
  },
  direct_mail: {
    "message.queued": "Queued for print",
    "message.sent": "Mailed",
    "message.delivered": "Delivered (estimated)",
    "short_url.visited": "Printed short link opened",
    "portal.logged_in": "Logged into the application",
    "message.replied": "Reply received",
    "message.bounced": "Returned to sender",
    "message.opted_out": "Do-not-mail request",
    "followup.scheduled": "Follow-up scheduled",
  },
};

export const MAIL_DELIVERY_CAPTION =
  "Postal delivery has no receipt — a real direct-mail run can only estimate this date.";

export const BOUNCE_DETAIL: Record<Channel, string> = {
  email: "550 5.1.1 recipient address rejected (simulated)",
  sms: "carrier rejected: unknown subscriber (simulated)",
  direct_mail: "returned to sender: vacant / no such number (simulated)",
};

/** `message.opened` is email-only; neither SMS nor postal mail has an open receipt. */
export const ALLOWED_FACTS: Record<Channel, FactType[]> = {
  email: [
    "message.queued",
    "message.sent",
    "message.delivered",
    "message.opened",
    "short_url.visited",
    "portal.logged_in",
    "message.replied",
    "message.bounced",
    "message.opted_out",
    "followup.scheduled",
  ],
  sms: [
    "message.queued",
    "message.sent",
    "message.delivered",
    "short_url.visited",
    "portal.logged_in",
    "message.replied",
    "message.bounced",
    "message.opted_out",
    "followup.scheduled",
  ],
  direct_mail: [
    "message.queued",
    "message.sent",
    "message.delivered",
    "short_url.visited",
    "portal.logged_in",
    "message.replied",
    "message.bounced",
    "message.opted_out",
    "followup.scheduled",
  ],
};

/** Maps a fact to the state it establishes. `followup.scheduled` annotates, not transitions. */
export function factToState(factType: FactType): MessageState | null {
  switch (factType) {
    case "message.queued":
      return "queued";
    case "message.sent":
      return "sent";
    case "message.delivered":
      return "delivered";
    case "message.opened":
      return "opened";
    case "short_url.visited":
      return "clicked";
    case "portal.logged_in":
      return "logged_in";
    case "message.replied":
      return "replied";
    case "message.bounced":
      return "bounced";
    case "message.opted_out":
      return "opted_out";
    case "followup.scheduled":
      return null;
  }
}

export const TRANSITIONS: Record<MessageState, MessageState[]> = {
  queued: ["sent", "bounced"],
  sent: ["delivered", "bounced"],
  delivered: ["opened", "clicked", "replied", "opted_out"],
  opened: ["clicked", "replied", "opted_out"],
  clicked: ["logged_in", "replied", "opted_out"],
  logged_in: ["replied", "opted_out"],
  replied: ["opted_out"],
  bounced: [],
  opted_out: [],
};

export function canTransition(channel: Channel, from: MessageState, to: MessageState): boolean {
  if (to === "opened" && channel !== "email") return false;
  return TRANSITIONS[from].includes(to);
}

const STATE_RANK: MessageState[] = [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "logged_in",
  "replied",
];

export function messageStateFrom(facts: FactType[]): MessageState {
  if (facts.includes("message.bounced")) return "bounced";
  if (facts.includes("message.opted_out")) return "opted_out";

  const present = new Set<MessageState>();
  for (const fact of facts) {
    const state = factToState(fact);
    if (state !== null) present.add(state);
  }

  for (let i = STATE_RANK.length - 1; i >= 0; i--) {
    if (present.has(STATE_RANK[i])) return STATE_RANK[i];
  }

  return "queued";
}

const STATE_TO_FACT: Record<MessageState, FactType> = {
  queued: "message.queued",
  sent: "message.sent",
  delivered: "message.delivered",
  opened: "message.opened",
  clicked: "short_url.visited",
  logged_in: "portal.logged_in",
  replied: "message.replied",
  bounced: "message.bounced",
  opted_out: "message.opted_out",
};

export function stateLabel(channel: Channel, state: MessageState): string {
  const fact = STATE_TO_FACT[state];
  return FACT_LABEL[channel][fact] ?? fact;
}

export type Counts = {
  messages: number;
  sent: number;
  delivered: number;
  clicked: number;
  replied: number;
  bounced: number;
  opened: number;
  loggedIn: number;
  optedOut: number;
};

export const COUNT_FACT: Record<keyof Omit<Counts, "messages">, FactType> = {
  sent: "message.sent",
  delivered: "message.delivered",
  clicked: "short_url.visited",
  replied: "message.replied",
  bounced: "message.bounced",
  opened: "message.opened",
  loggedIn: "portal.logged_in",
  optedOut: "message.opted_out",
};

/**
 * Each counter is the number of distinct message ids that have at least one event of
 * that fact type — not a current-state tally. A clicked message still counts in
 * `delivered`.
 */
export function countsFrom(
  messageIds: string[],
  facts: { messageId: string; factType: FactType }[],
): Counts {
  const idSet = new Set(messageIds);
  const relevant = facts.filter((f) => idSet.has(f.messageId));

  const counts: Counts = {
    messages: idSet.size,
    sent: 0,
    delivered: 0,
    clicked: 0,
    replied: 0,
    bounced: 0,
    opened: 0,
    loggedIn: 0,
    optedOut: 0,
  };

  for (const key of Object.keys(COUNT_FACT) as (keyof Omit<Counts, "messages">)[]) {
    const factType = COUNT_FACT[key];
    const withFact = new Set(
      relevant.filter((f) => f.factType === factType).map((f) => f.messageId),
    );
    counts[key] = withFact.size;
  }

  return counts;
}
