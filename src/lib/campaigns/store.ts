import type { Owner } from "@/lib/owners";
import { campaignId, eventId, messageId, shortToken } from "@/lib/campaigns/ids";
import {
  BOUNCE_DETAIL,
  CHANNEL_LABEL,
  canTransition,
  factToState,
  messageStateFrom,
  type Channel,
  type FactType,
  type MessageState,
} from "@/lib/campaigns/model";
import { destinationFor } from "@/lib/campaigns/contact";
import { renderTemplate, templateFor } from "@/lib/campaigns/templates";
import { planEvents, simulatedAt, HARD_TICK_CAP } from "@/lib/campaigns/simulate";

/**
 * The `localStorage`-backed campaign store — this is the ONLY simulated dispatch
 * surface in the app. Nothing in this module or its siblings ever reaches outside the
 * browser to send a real message; see `no-dispatch.test.ts` for the guard that enforces
 * it. No React import, no `"use client"` directive — components call
 * `useSyncExternalStore` themselves.
 */

export const CAMPAIGNS_STORAGE_KEY = "parcel-crm.campaigns.v1";
export const PROJECTS_STORAGE_KEY = "parcel-crm.projects.v1"; // read-only, ISSUE-004's key
export const MAX_AUDIENCE = 25;

export type Campaign = {
  id: string;
  name: string;
  channel: Channel;
  templateId: string;
  audienceLabel: string;
  projectId: string | null;
  projectName: string | null;
  createdAtMs: number;
  tick: number;
  simulated: true;
};

export type Message = {
  id: string;
  campaignId: string;
  ownerKey: string;
  ownerName: string;
  channel: Channel;
  toValue: string;
  toProvenance: "mocked" | "county-source";
  toSourceLabel: string;
  subject: string | null;
  body: string;
  shortUrlToken: string;
  recipientIndex: number;
  baseTick: number;
  followUpOfMessageId: string | null;
  followUpNote: string | null;
  simulated: true;
};

export type LifecycleEvent = {
  eventIdentifier: string;
  messageId: string;
  factType: FactType;
  effectiveAt: string;
  tick: number;
  origin: "scheduler" | "browser";
  detail: string | null;
  idempotencyKey: string;
};

export type ShortLink = { shortUrlToken: string; shortUrlPath: string; targetUrl: string };

export type CampaignsState = {
  version: 1;
  campaigns: Campaign[];
  messages: Message[];
  events: LifecycleEvent[];
  shortLinks: ShortLink[];
};

export const EMPTY_STATE: CampaignsState = Object.freeze({
  version: 1,
  campaigns: [],
  messages: [],
  events: [],
  shortLinks: [],
}) as CampaignsState;

let cache: CampaignsState | null = null;
const listeners = new Set<() => void>();

// Private, non-persisted enrichment cache: ownerKey -> Owner, populated by
// createCampaigns from its `audience` input. It exists only so scheduleFollowUp can
// render a follow-up with the same parcel_count / total_acres / mailing_address the
// original campaign used, in the same browser session. It is never part of the
// persisted CampaignsState and a follow-up scheduled without it falls back to the
// owner's own message history (see scheduleFollowUp below).
const ownerDirectoryCache = new Map<string, Owner>();

function onStorage(e: StorageEvent): void {
  if (e.key === CAMPAIGNS_STORAGE_KEY || e.key === null) {
    cache = null;
    for (const listener of listeners) listener();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function readFromStorage(): CampaignsState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    if (raw === null) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<CampaignsState> | null;
    if (parsed === null || parsed.version !== 1 || !Array.isArray(parsed.campaigns)) {
      return EMPTY_STATE;
    }
    return parsed as CampaignsState;
  } catch {
    return EMPTY_STATE;
  }
}

export function getSnapshot(): CampaignsState {
  if (cache !== null) return cache;
  cache = readFromStorage();
  return cache;
}

export function getServerSnapshot(): CampaignsState {
  return EMPTY_STATE;
}

function commit(next: CampaignsState): void {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort; storage may be full, disabled, or unavailable (private mode)
    }
  }
  for (const listener of listeners) listener();
}

export function resetAll(): void {
  cache = null;
  ownerDirectoryCache.clear();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(CAMPAIGNS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  for (const listener of listeners) listener();
}

export function readProjects(): {
  id: string;
  name: string;
  parcelPins: string[];
  parcelIds: string[];
}[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as { version?: number; projects?: unknown } | null;
    // v2 (ISSUE-013 onwards) stores member parcel ids; v1 stored PINs. Both are read, and
    // both are emitted, because the audience picker matches owners by PIN and resolves ids
    // through the loaded county records.
    if ((parsed?.version === 2 || parsed?.version === 1) && Array.isArray(parsed.projects)) {
      // ISSUE-004's shipped Project type called the member list `pins`; this module's
      // pre-merge contract guessed `parcelPins`. Accept both, and drop records that carry
      // no member list at all rather than crash the picker on undefined.
      return (parsed.projects as Record<string, unknown>[]).flatMap((p) => {
        const stringsOf = (v: unknown): string[] | null =>
          Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : null;
        const pins = stringsOf(p.parcelPins) ?? stringsOf(p.pins);
        const ids = stringsOf(p.parcelIds);
        if ((pins === null && ids === null) || typeof p.id !== "string" || typeof p.name !== "string")
          return [];
        return [{ id: p.id, name: p.name, parcelPins: pins ?? [], parcelIds: ids ?? [] }];
      });
    }
    return [];
  } catch {
    return [];
  }
}

export function messageFacts(state: CampaignsState, messageId: string): FactType[] {
  return state.events.filter((e) => e.messageId === messageId).map((e) => e.factType);
}

export function messageStateOf(state: CampaignsState, messageId: string): MessageState {
  return messageStateFrom(messageFacts(state, messageId));
}

/**
 * Replaces every `{{name}}` in `text` with `vars[name]`, throwing on an unknown
 * variable. Mirrors `renderTemplate`'s no-silent-fallback substitution
 * (`@/lib/campaigns/templates`) so a bare rendered subject line can be produced without
 * `renderTemplate`'s compliance-text/footer suffix.
 */
function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) {
      throw new Error(`unknown template variable: ${name}`);
    }
    return vars[name];
  });
}

/** The W2 uniqueness rule: on collision, append "|1", "|2", … up to 8 attempts. */
function uniqueId(
  make: (seed: string) => string,
  seed: string,
  exists: (id: string) => boolean,
): string {
  let candidate = make(seed);
  if (!exists(candidate)) return candidate;
  for (let attempt = 1; attempt <= 8; attempt++) {
    candidate = make(`${seed}|${attempt}`);
    if (!exists(candidate)) return candidate;
  }
  throw new Error("id space exhausted");
}

/**
 * The single code path that turns planned events into stored ones, used by creation,
 * `advanceCampaign` and `runToCompletion`. For each message of the campaign, for each
 * `PlannedEvent` whose `tickOffset` is `> fromTick` and `<= toTick`, in ascending offset
 * order: skip a duplicate idempotency key, skip an illegal transition silently, else
 * append the event.
 */
function materialise(
  state: CampaignsState,
  campaign: Campaign,
  fromTick: number,
  toTick: number,
): LifecycleEvent[] {
  const campaignMessages = state.messages.filter((m) => m.campaignId === campaign.id);
  const newEvents: LifecycleEvent[] = [];

  for (const message of campaignMessages) {
    const planned = planEvents(
      message.channel,
      message.recipientIndex,
      message.id,
      message.baseTick,
    );
    const inRange = planned.filter((pe) => pe.tickOffset > fromTick && pe.tickOffset <= toTick);

    for (const pe of inRange) {
      const idempotencyKey = `${message.id}|${pe.factType}|${pe.tickOffset}`;
      const alreadyExists =
        state.events.some((e) => e.idempotencyKey === idempotencyKey) ||
        newEvents.some((e) => e.idempotencyKey === idempotencyKey);
      if (alreadyExists) continue;

      const priorFacts = [
        ...state.events.filter((e) => e.messageId === message.id).map((e) => e.factType),
        ...newEvents.filter((e) => e.messageId === message.id).map((e) => e.factType),
      ];
      const currentState = messageStateFrom(priorFacts);
      const nextState = factToState(pe.factType);
      if (nextState === null) continue;
      if (!canTransition(message.channel, currentState, nextState)) continue;

      newEvents.push({
        eventIdentifier: eventId(idempotencyKey),
        messageId: message.id,
        factType: pe.factType,
        effectiveAt: simulatedAt(campaign.createdAtMs, pe.tickOffset),
        tick: pe.tickOffset,
        origin: "scheduler",
        detail: pe.factType === "message.bounced" ? BOUNCE_DETAIL[message.channel] : null,
        idempotencyKey,
      });
    }
  }

  return newEvents;
}

export function createCampaigns(input: {
  name: string;
  channels: Channel[];
  audience: Owner[];
  projectId: string | null;
  projectName: string | null;
  nowMs: number;
}): {
  campaignIds: string[];
  skipped: { ownerKey: string; ownerName: string; channel: Channel; reason: string }[];
} {
  const state = getSnapshot();
  const campaigns = state.campaigns.slice();
  const messages = state.messages.slice();
  const shortLinks = state.shortLinks.slice();

  const cappedAudience = input.audience.slice(0, MAX_AUDIENCE);
  for (const owner of cappedAudience) {
    ownerDirectoryCache.set(owner.ownerKey, owner);
  }

  const optedOutOwnerKeys = new Set<string>();
  for (const e of state.events) {
    if (e.factType === "message.opted_out") {
      const msg = state.messages.find((m) => m.id === e.messageId);
      if (msg) optedOutOwnerKeys.add(msg.ownerKey);
    }
  }
  const suppressedCount = cappedAudience.filter((o) => optedOutOwnerKeys.has(o.ownerKey)).length;
  const selected = cappedAudience.length - suppressedCount;

  const campaignIds: string[] = [];
  const allSkipped: { ownerKey: string; ownerName: string; channel: Channel; reason: string }[] =
    [];

  for (const channel of input.channels) {
    const skipsForChannel: {
      ownerKey: string;
      ownerName: string;
      channel: Channel;
      reason: string;
    }[] = [];
    const reachable: { owner: Owner; destination: ReturnType<typeof destinationFor> }[] = [];

    for (const owner of cappedAudience) {
      if (optedOutOwnerKeys.has(owner.ownerKey)) {
        skipsForChannel.push({
          ownerKey: owner.ownerKey,
          ownerName: owner.ownerName,
          channel,
          reason: "Opted out of a previous simulated campaign — suppressed.",
        });
        continue;
      }
      const destination = destinationFor(owner, channel);
      if (!destination.mailable) {
        skipsForChannel.push({
          ownerKey: owner.ownerKey,
          ownerName: owner.ownerName,
          channel,
          reason: destination.reason,
        });
        continue;
      }
      reachable.push({ owner, destination });
    }

    const campaignSeed = `${input.nowMs}|${input.name}|${channel}`;
    const newCampaignId = uniqueId(campaignId, campaignSeed, (id) =>
      campaigns.some((c) => c.id === id),
    );

    const audienceLabel =
      `${selected} owners selected · ${reachable.length} reachable on this channel · ${skipsForChannel.length} skipped` +
      (skipsForChannel.length > 0
        ? ": " + skipsForChannel.map((s) => `${s.ownerName} — ${s.reason}`).join("; ")
        : "");

    const template = templateFor("acquisition_intro", channel);

    const campaign: Campaign = {
      id: newCampaignId,
      name: `${input.name} — ${CHANNEL_LABEL[channel]}`,
      channel,
      templateId: template.templateId,
      audienceLabel,
      projectId: input.projectId,
      projectName: input.projectName,
      createdAtMs: input.nowMs,
      tick: 0,
      simulated: true,
    };

    campaigns.push(campaign);
    campaignIds.push(campaign.id);
    allSkipped.push(...skipsForChannel);

    reachable.forEach(({ owner, destination }, recipientIndex) => {
      const msgSeed = `${campaign.id}|${owner.ownerKey}|${channel}|0`;
      const msgId = uniqueId(messageId, msgSeed, (id) => messages.some((m) => m.id === id));
      const token = shortToken(msgId);

      shortLinks.push({
        shortUrlToken: token,
        shortUrlPath: `/r/${token}`,
        targetUrl: `/campaigns/offer/${token}`,
      });

      const vars: Record<string, string> = {
        owner_name: owner.ownerName,
        parcel_count: String(owner.parcelCount),
        total_acres: `${owner.totalAcres.toFixed(2)} ac`,
        project_name: input.projectName ?? "a data-center site in Rock Island County",
        mailing_address: channel === "direct_mail" ? (destination.value ?? "") : "",
        short_url: `https://ri.invalid/r/${token}`,
        sender_name: "Elephant Land Acquisition (simulated)",
      };

      const renderedSubject = template.subject !== null ? substitute(template.subject, vars) : null;
      const body = renderTemplate(template, vars);

      messages.push({
        id: msgId,
        campaignId: campaign.id,
        ownerKey: owner.ownerKey,
        ownerName: owner.ownerName,
        channel,
        toValue: destination.value ?? "",
        toProvenance: destination.provenance,
        toSourceLabel: destination.sourceLabel,
        subject: renderedSubject,
        body,
        shortUrlToken: token,
        recipientIndex,
        baseTick: 0,
        followUpOfMessageId: null,
        followUpNote: null,
        simulated: true,
      });
    });
  }

  let nextState: CampaignsState = {
    version: 1,
    campaigns,
    messages,
    events: state.events,
    shortLinks,
  };

  for (const id of campaignIds) {
    const campaign = nextState.campaigns.find((c) => c.id === id);
    if (!campaign) continue;
    const newEvents = materialise(nextState, campaign, -1, 0);
    nextState = { ...nextState, events: [...nextState.events, ...newEvents] };
  }

  commit(nextState);

  return { campaignIds, skipped: allSkipped };
}

function advanceCampaignState(
  state: CampaignsState,
  campaign: Campaign,
  toTick: number,
): CampaignsState {
  const clampedTarget = Math.min(toTick, HARD_TICK_CAP);
  if (clampedTarget <= campaign.tick) return state;

  const newEvents = materialise(state, campaign, campaign.tick, clampedTarget);
  const updatedCampaign: Campaign = { ...campaign, tick: clampedTarget };
  const campaigns = state.campaigns.map((c) => (c.id === campaign.id ? updatedCampaign : c));
  const events = [...state.events, ...newEvents];

  return { ...state, campaigns, events };
}

export function advanceCampaign(id: string, byTicks: number): void {
  const state = getSnapshot();
  const campaign = state.campaigns.find((c) => c.id === id);
  if (!campaign) return;
  const next = advanceCampaignState(state, campaign, campaign.tick + byTicks);
  commit(next);
}

export function advanceAll(byTicks: number): void {
  let state = getSnapshot();
  for (const campaign of state.campaigns) {
    state = advanceCampaignState(state, campaign, campaign.tick + byTicks);
  }
  commit(state);
}

export function campaignMaxTick(state: CampaignsState, campaignId: string): number {
  const campaignMessages = state.messages.filter((m) => m.campaignId === campaignId);
  let max = 0;
  for (const message of campaignMessages) {
    const planned = planEvents(
      message.channel,
      message.recipientIndex,
      message.id,
      message.baseTick,
    );
    for (const pe of planned) {
      if (pe.tickOffset > max) max = pe.tickOffset;
    }
  }
  return max;
}

export function runToCompletion(): void {
  let state = getSnapshot();
  for (const campaign of state.campaigns) {
    const maxTick = campaignMaxTick(state, campaign.id);
    state = advanceCampaignState(state, campaign, maxTick);
  }
  commit(state);
}

export function recordBrowserFact(
  token: string,
  factType: "short_url.visited" | "portal.logged_in",
): { ok: true } | { ok: false; reason: string } {
  const state = getSnapshot();
  const message = state.messages.find((m) => m.shortUrlToken === token);
  if (!message) {
    return { ok: false, reason: "Unknown short link." };
  }
  const campaign = state.campaigns.find((c) => c.id === message.campaignId);
  if (!campaign) {
    return { ok: false, reason: "Unknown short link." };
  }

  const facts = messageFacts(state, message.id);
  const currentState = messageStateFrom(facts);

  if (currentState === "bounced") {
    return {
      ok: false,
      reason: "This message bounced in the simulation — the short link is dead.",
    };
  }
  if (currentState === "opted_out") {
    return {
      ok: false,
      reason: "This owner opted out in the simulation — the short link is disabled.",
    };
  }
  if (factType === "short_url.visited" && (currentState === "queued" || currentState === "sent")) {
    return {
      ok: false,
      reason: "Not delivered yet in the simulation — advance the simulation first.",
    };
  }
  if (factType === "portal.logged_in" && !facts.includes("short_url.visited")) {
    return { ok: false, reason: "The short link has not been opened yet." };
  }

  const idempotencyKey = `${message.id}|${factType}|browser|${campaign.tick}`;
  if (state.events.some((e) => e.idempotencyKey === idempotencyKey)) {
    return { ok: true };
  }

  const event: LifecycleEvent = {
    eventIdentifier: eventId(idempotencyKey),
    messageId: message.id,
    factType,
    effectiveAt: simulatedAt(campaign.createdAtMs, campaign.tick),
    tick: campaign.tick,
    origin: "browser",
    detail: null,
    idempotencyKey,
  };

  commit({ ...state, events: [...state.events, event] });
  return { ok: true };
}

export function scheduleFollowUp(
  parentMessageId: string,
  channel: Channel,
  note: string,
): { ok: true; messageId: string } | { ok: false; reason: string } {
  const state = getSnapshot();
  const parent = state.messages.find((m) => m.id === parentMessageId);
  if (!parent) {
    return { ok: false, reason: "Unknown message." };
  }
  const campaign = state.campaigns.find((c) => c.id === parent.campaignId);
  if (!campaign) {
    return { ok: false, reason: "Unknown message." };
  }

  const cachedOwner = ownerDirectoryCache.get(parent.ownerKey);
  const priorDirectMail = state.messages.find(
    (m) =>
      m.ownerKey === parent.ownerKey &&
      m.channel === "direct_mail" &&
      m.toProvenance === "county-source",
  );

  let mailingStreet: string | null = null;
  let mailingCityStateZip: string | null = null;
  if (cachedOwner) {
    mailingStreet = cachedOwner.mailingStreet;
    mailingCityStateZip = cachedOwner.mailingCityStateZip;
  } else if (priorDirectMail) {
    const [street, ...rest] = priorDirectMail.toValue.split("\n");
    mailingStreet = street ?? null;
    mailingCityStateZip = rest.length > 0 ? rest.join("\n") : null;
  }

  const owner: Owner = {
    ownerKey: parent.ownerKey,
    ownerName: parent.ownerName,
    parcelPins: cachedOwner?.parcelPins ?? [],
    parcelCount: cachedOwner?.parcelCount ?? 1,
    totalAcres: cachedOwner?.totalAcres ?? 0,
    mailingStreet,
    mailingCityStateZip,
  };

  const destination = destinationFor(owner, channel);
  if (!destination.mailable) {
    return { ok: false, reason: destination.reason };
  }

  const followUpIndex = state.messages.filter(
    (m) => m.campaignId === campaign.id && m.ownerKey === owner.ownerKey && m.channel === channel,
  ).length;

  const msgSeed = `${campaign.id}|${owner.ownerKey}|${channel}|${followUpIndex}`;
  const msgId = uniqueId(messageId, msgSeed, (id) => state.messages.some((m) => m.id === id));
  const token = shortToken(msgId);

  const template = templateFor("acquisition_followup", channel);
  const vars: Record<string, string> = {
    owner_name: owner.ownerName,
    parcel_count: String(owner.parcelCount),
    total_acres: `${owner.totalAcres.toFixed(2)} ac`,
    project_name: campaign.projectName ?? "a data-center site in Rock Island County",
    mailing_address: channel === "direct_mail" ? (destination.value ?? "") : "",
    short_url: `https://ri.invalid/r/${token}`,
    sender_name: "Elephant Land Acquisition (simulated)",
  };

  const renderedSubject = template.subject !== null ? substitute(template.subject, vars) : null;
  const body = renderTemplate(template, vars);

  const newMessage: Message = {
    id: msgId,
    campaignId: campaign.id,
    ownerKey: owner.ownerKey,
    ownerName: owner.ownerName,
    channel,
    toValue: destination.value ?? "",
    toProvenance: destination.provenance,
    toSourceLabel: destination.sourceLabel,
    subject: renderedSubject,
    body,
    shortUrlToken: token,
    recipientIndex: state.messages.filter((m) => m.campaignId === campaign.id).length,
    baseTick: campaign.tick,
    followUpOfMessageId: parentMessageId,
    followUpNote: note,
    simulated: true,
  };

  const followUpIdempotencyKey = `${parent.id}|followup.scheduled|browser|${campaign.tick}|${msgId}`;
  const followUpEvent: LifecycleEvent = {
    eventIdentifier: eventId(followUpIdempotencyKey),
    messageId: parent.id,
    factType: "followup.scheduled",
    effectiveAt: simulatedAt(campaign.createdAtMs, campaign.tick),
    tick: campaign.tick,
    origin: "browser",
    detail: note,
    idempotencyKey: followUpIdempotencyKey,
  };

  const shortLink: ShortLink = {
    shortUrlToken: token,
    shortUrlPath: `/r/${token}`,
    targetUrl: `/campaigns/offer/${token}`,
  };

  let nextState: CampaignsState = {
    ...state,
    messages: [...state.messages, newMessage],
    events: [...state.events, followUpEvent],
    shortLinks: [...state.shortLinks, shortLink],
  };

  const materialised = materialise(nextState, campaign, campaign.tick - 1, campaign.tick);
  nextState = { ...nextState, events: [...nextState.events, ...materialised] };

  commit(nextState);

  return { ok: true, messageId: msgId };
}

export function ownerHistory(state: CampaignsState, ownerKey: string): LifecycleEvent[] {
  const messageIds = new Set(
    state.messages.filter((m) => m.ownerKey === ownerKey).map((m) => m.id),
  );
  const events = state.events.filter((e) => messageIds.has(e.messageId));

  const campaignOrder = new Map<string, number>();
  state.campaigns.forEach((c, i) => campaignOrder.set(c.id, i));
  const messageById = new Map(state.messages.map((m) => [m.id, m]));

  return events.slice().sort((a, b) => {
    if (a.effectiveAt !== b.effectiveAt) return a.effectiveAt < b.effectiveAt ? -1 : 1;
    const ma = messageById.get(a.messageId);
    const mb = messageById.get(b.messageId);
    const ca = ma ? (campaignOrder.get(ma.campaignId) ?? 0) : 0;
    const cb = mb ? (campaignOrder.get(mb.campaignId) ?? 0) : 0;
    if (ca !== cb) return ca - cb;
    return (ma?.recipientIndex ?? 0) - (mb?.recipientIndex ?? 0);
  });
}
