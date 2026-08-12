import { fnv1a32 } from "@/lib/owners";
import type { Channel, FactType } from "@/lib/campaigns/model";

/**
 * The deterministic simulator. Every function here is pure — the wall clock is injected
 * by the caller, and outcomes are assigned by **position in the audience**
 * (`recipientIndex % 8`), not by a random draw, so a demo run is byte-identical every
 * time.
 */

export const TICK_HOURS = 12;
export const HARD_TICK_CAP = 64;

export type PlannedEvent = { factType: FactType; tickOffset: number };

const EMAIL_PATHS: FactType[][] = [
  ["message.sent", "message.delivered", "message.opened", "short_url.visited", "portal.logged_in", "message.replied"],
  ["message.sent", "message.delivered", "message.opened", "short_url.visited", "message.replied"],
  ["message.sent", "message.delivered", "message.opened", "short_url.visited"],
  ["message.sent", "message.delivered", "message.opened"],
  ["message.sent", "message.delivered"],
  ["message.sent", "message.bounced"],
  ["message.sent", "message.delivered", "message.opened", "message.opted_out"],
  ["message.sent", "message.delivered", "message.opened", "short_url.visited", "portal.logged_in"],
];

const NO_OPEN_PATHS: FactType[][] = [
  ["message.sent", "message.delivered", "short_url.visited", "portal.logged_in", "message.replied"],
  ["message.sent", "message.delivered", "short_url.visited", "message.replied"],
  ["message.sent", "message.delivered", "short_url.visited"],
  ["message.sent", "message.delivered", "message.replied"],
  ["message.sent", "message.delivered"],
  ["message.sent", "message.bounced"],
  ["message.sent", "message.delivered", "message.opted_out"],
  ["message.sent", "message.delivered", "short_url.visited", "portal.logged_in"],
];

export const OUTCOME_PATHS: Record<Channel, FactType[][]> = {
  email: EMAIL_PATHS,
  sms: NO_OPEN_PATHS,
  direct_mail: NO_OPEN_PATHS,
};

export const BASE_OFFSET: Record<Channel, Partial<Record<FactType, number>>> = {
  email: {
    "message.queued": 0,
    "message.sent": 1,
    "message.delivered": 1,
    "message.bounced": 1,
    "message.opened": 2,
    "short_url.visited": 3,
    "portal.logged_in": 4,
    "message.replied": 5,
    "message.opted_out": 3,
  },
  sms: {
    "message.queued": 0,
    "message.sent": 1,
    "message.delivered": 1,
    "message.bounced": 1,
    "short_url.visited": 2,
    "portal.logged_in": 3,
    "message.replied": 4,
    "message.opted_out": 2,
  },
  direct_mail: {
    "message.queued": 0,
    "message.sent": 1,
    "message.delivered": 5,
    "message.bounced": 5,
    "short_url.visited": 6,
    "portal.logged_in": 7,
    "message.replied": 8,
    "message.opted_out": 6,
  },
};

function offsetFor(channel: Channel, factType: FactType): number {
  const offset = BASE_OFFSET[channel][factType];
  if (offset === undefined) {
    throw new Error(`no base offset for ${channel}/${factType}`);
  }
  return offset;
}

/** Positional, not random: an 8-recipient audience produces one of each outcome. */
export function outcomePathIndex(recipientIndex: number, channel: Channel): number {
  const paths = OUTCOME_PATHS[channel];
  return recipientIndex % paths.length;
}

/** One jitter per message, applied to every fact except `message.queued`. */
export function messageJitter(messageId: string): 0 | 1 {
  return (fnv1a32(messageId) % 2) as 0 | 1;
}

export function planEvents(
  channel: Channel,
  recipientIndex: number,
  messageId: string,
  baseTick: number,
): PlannedEvent[] {
  const path = OUTCOME_PATHS[channel][outcomePathIndex(recipientIndex, channel)];
  const jitter = messageJitter(messageId);

  const events: PlannedEvent[] = [{ factType: "message.queued", tickOffset: baseTick }];
  for (const factType of path) {
    events.push({ factType, tickOffset: baseTick + offsetFor(channel, factType) + jitter });
  }

  // A stable sort over a list already built in path order preserves path-order ties.
  return events.sort((a, b) => a.tickOffset - b.tickOffset);
}

export function simulatedAt(campaignCreatedAtMs: number, tickOffset: number): string {
  return new Date(campaignCreatedAtMs + tickOffset * TICK_HOURS * 3600_000).toISOString();
}
