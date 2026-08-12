import { beforeEach, describe, expect, it } from "vitest";
import type { Owner } from "@/lib/owners";
import { countsFrom } from "@/lib/campaigns/model";
import {
  advanceAll,
  clearToEmpty,
  createCampaigns,
  getSnapshot,
  messageStateOf,
  ownerHistory,
  recordBrowserFact,
  resetAll,
  runToCompletion,
  scheduleFollowUp,
} from "./store";

const NOW_MS = 1_700_000_000_000;

function owner(i: number, opts?: { noAddress?: boolean }): Owner {
  return {
    ownerKey: `synthetic-owner-${i}`,
    ownerName: `SYNTHETIC OWNER ${i}`,
    parcelPins: [`P${i}`],
    parcelCount: i + 1,
    totalAcres: (i + 1) * 10,
    mailingStreet: opts?.noAddress ? null : `${100 + i} MAIN ST`,
    mailingCityStateZip: opts?.noAddress ? null : "ROCK ISLAND IL 61201",
  };
}

// Eight synthetic owners, one (index 4) with no county mailing address — this is the
// audience shape store.test.ts's acceptance list specifies.
function eightOwners(): Owner[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => owner(i, { noAddress: i === 4 }));
}

function createAllThreeChannels(nowMs: number = NOW_MS) {
  return createCampaigns({
    name: "Test Campaign",
    channels: ["email", "sms", "direct_mail"],
    audience: eightOwners(),
    projectId: null,
    projectName: null,
    nowMs,
  });
}

describe("createCampaigns", () => {
  beforeEach(() => {
    resetAll();
  });

  it("creates one campaign per channel, skipping the addressless owner only for direct_mail", () => {
    const result = createAllThreeChannels();
    expect(result.campaignIds.length).toBe(3);

    const state = getSnapshot();
    expect(state.messages.filter((m) => m.channel === "email").length).toBe(8);
    expect(state.messages.filter((m) => m.channel === "sms").length).toBe(8);
    expect(state.messages.filter((m) => m.channel === "direct_mail").length).toBe(7);

    const addressSkips = result.skipped.filter((s) => s.channel === "direct_mail");
    expect(addressSkips.length).toBe(1);
    expect(addressSkips[0].reason).toBe(
      "No county mailing address on file — this owner cannot receive direct mail.",
    );
  });

  it("leaves every message queued, with only message.queued stored, immediately after creation", () => {
    createAllThreeChannels();
    const state = getSnapshot();

    for (const message of state.messages) {
      expect(messageStateOf(state, message.id)).toBe("queued");
    }
    for (const event of state.events) {
      expect(event.factType).toBe("message.queued");
    }
  });
});

describe("runToCompletion", () => {
  beforeEach(() => {
    resetAll();
  });

  it("matches W6's predicted email counts exactly", () => {
    createAllThreeChannels();
    runToCompletion();
    const state = getSnapshot();

    const emailCampaign = state.campaigns.find((c) => c.channel === "email")!;
    const emailMessageIds = state.messages
      .filter((m) => m.campaignId === emailCampaign.id)
      .map((m) => m.id);
    const facts = state.events
      .filter((e) => emailMessageIds.includes(e.messageId))
      .map((e) => ({ messageId: e.messageId, factType: e.factType }));

    const counts = countsFrom(emailMessageIds, facts);
    expect(counts.sent).toBe(8);
    expect(counts.delivered).toBe(7);
    expect(counts.opened).toBe(6);
    expect(counts.clicked).toBe(4);
    expect(counts.replied).toBe(2);
    expect(counts.bounced).toBe(1);
  });

  it("keeps delivered + bounced === sent for all three campaigns", () => {
    createAllThreeChannels();
    runToCompletion();
    const state = getSnapshot();

    for (const campaign of state.campaigns) {
      const ids = state.messages.filter((m) => m.campaignId === campaign.id).map((m) => m.id);
      const facts = state.events
        .filter((e) => ids.includes(e.messageId))
        .map((e) => ({ messageId: e.messageId, factType: e.factType }));
      const counts = countsFrom(ids, facts);
      expect(counts.delivered + counts.bounced).toBe(counts.sent);
    }
  });
});

describe("advanceAll idempotency", () => {
  beforeEach(() => {
    resetAll();
  });

  it("three separate advanceAll(1) calls produce the same event set as one advanceAll(3)", () => {
    createAllThreeChannels();
    advanceAll(1);
    advanceAll(1);
    advanceAll(1);
    const stepwiseKeys = new Set(getSnapshot().events.map((e) => e.idempotencyKey));
    const stepwiseCount = getSnapshot().events.length;

    resetAll();
    createAllThreeChannels();
    advanceAll(3);
    const singleShotKeys = new Set(getSnapshot().events.map((e) => e.idempotencyKey));
    const singleShotCount = getSnapshot().events.length;

    expect(stepwiseCount).toBe(singleShotCount);
    expect(stepwiseKeys).toEqual(singleShotKeys);
  });
});

describe("recordBrowserFact", () => {
  beforeEach(() => {
    resetAll();
  });

  it("rejects a click on a bounced message and appends no event", () => {
    createAllThreeChannels();
    runToCompletion();
    const state = getSnapshot();
    const emailCampaign = state.campaigns.find((c) => c.channel === "email")!;
    const bounced = state.messages
      .filter((m) => m.campaignId === emailCampaign.id)
      .find((m) => messageStateOf(state, m.id) === "bounced")!;
    expect(bounced).toBeDefined();

    const before = getSnapshot().events.length;
    const result = recordBrowserFact(bounced.shortUrlToken, "short_url.visited");
    expect(result).toEqual({
      ok: false,
      reason: "This message bounced in the simulation — the short link is dead.",
    });
    expect(getSnapshot().events.length).toBe(before);
  });

  it("rejects a click on a still-queued message with the not-delivered reason", () => {
    createAllThreeChannels();
    const state = getSnapshot();
    const anyMessage = state.messages[0];

    const result = recordBrowserFact(anyMessage.shortUrlToken, "short_url.visited");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(
        "Not delivered yet in the simulation — advance the simulation first.",
      );
    }
  });

  it("accepts a click and a login on a delivered message, both with browser origin", () => {
    createAllThreeChannels();
    runToCompletion();
    const state = getSnapshot();
    const delivered = state.messages.find((m) => messageStateOf(state, m.id) === "delivered")!;
    expect(delivered).toBeDefined();

    const clickResult = recordBrowserFact(delivered.shortUrlToken, "short_url.visited");
    expect(clickResult.ok).toBe(true);
    const loginResult = recordBrowserFact(delivered.shortUrlToken, "portal.logged_in");
    expect(loginResult.ok).toBe(true);

    const afterState = getSnapshot();
    const browserEvents = afterState.events.filter(
      (e) => e.messageId === delivered.id && e.origin === "browser",
    );
    expect(browserEvents.length).toBe(2);
  });
});

describe("scheduleFollowUp", () => {
  beforeEach(() => {
    resetAll();
  });

  it("creates a follow-up in the same campaign and annotates the parent, even on a bounced parent", () => {
    createAllThreeChannels();
    runToCompletion();
    const state = getSnapshot();
    const emailCampaign = state.campaigns.find((c) => c.channel === "email")!;
    const bounced = state.messages
      .filter((m) => m.campaignId === emailCampaign.id)
      .find((m) => messageStateOf(state, m.id) === "bounced")!;
    expect(bounced).toBeDefined();

    const beforeCount = state.messages.filter((m) => m.campaignId === emailCampaign.id).length;
    const result = scheduleFollowUp(
      bounced.id,
      "direct_mail",
      "Bounced — retry on another channel.",
    );
    expect(result.ok).toBe(true);

    const afterState = getSnapshot();
    const afterCount = afterState.messages.filter((m) => m.campaignId === emailCampaign.id).length;
    expect(afterCount).toBe(beforeCount + 1);

    const followUpEvent = afterState.events.find(
      (e) => e.messageId === bounced.id && e.factType === "followup.scheduled",
    );
    expect(followUpEvent).toBeDefined();
    expect(followUpEvent?.detail).toBe("Bounced — retry on another channel.");
  });

  it("rejects a direct_mail follow-up for an owner with no county mailing address", () => {
    createAllThreeChannels();
    const state = getSnapshot();
    const arsenalLike = state.messages.find(
      (m) => m.ownerKey === "synthetic-owner-4" && m.channel === "email",
    )!;
    expect(arsenalLike).toBeDefined();

    const result = scheduleFollowUp(arsenalLike.id, "direct_mail", "Try mail anyway.");
    expect(result).toEqual({
      ok: false,
      reason: "No county mailing address on file — this owner cannot receive direct mail.",
    });
  });
});

describe("ownerHistory", () => {
  beforeEach(() => {
    resetAll();
  });

  it("spans all three channels, in non-decreasing effectiveAt order, for an owner in all three campaigns", () => {
    createAllThreeChannels();
    runToCompletion();
    const state = getSnapshot();

    const history = ownerHistory(state, "synthetic-owner-0");
    const channelsSeen = new Set(
      history.map((e) => state.messages.find((m) => m.id === e.messageId)?.channel),
    );
    expect(channelsSeen.has("email")).toBe(true);
    expect(channelsSeen.has("sms")).toBe(true);
    expect(channelsSeen.has("direct_mail")).toBe(true);

    for (let i = 1; i < history.length; i++) {
      expect(history[i].effectiveAt >= history[i - 1].effectiveAt).toBe(true);
    }
  });
});

describe("clearToEmpty", () => {
  beforeEach(() => {
    resetAll();
  });

  it("leaves a present, explicitly empty envelope after a campaign existed", () => {
    createAllThreeChannels();
    expect(getSnapshot().campaigns.length).toBeGreaterThan(0);

    clearToEmpty();

    expect(getSnapshot()).toEqual({
      version: 1,
      campaigns: [],
      messages: [],
      events: [],
      shortLinks: [],
    });
  });
});

describe("suppression on a second createCampaigns run", () => {
  beforeEach(() => {
    resetAll();
  });

  it("excludes an owner with a prior opted_out event and creates no message for them", () => {
    createCampaigns({
      name: "First Run",
      channels: ["email"],
      audience: eightOwners(),
      projectId: null,
      projectName: null,
      nowMs: NOW_MS,
    });
    runToCompletion();

    const state = getSnapshot();
    const emailCampaign = state.campaigns.find((c) => c.channel === "email")!;
    const optedOut = state.messages
      .filter((m) => m.campaignId === emailCampaign.id)
      .find((m) => messageStateOf(state, m.id) === "opted_out")!;
    expect(optedOut).toBeDefined();

    const second = createCampaigns({
      name: "Second Run",
      channels: ["email"],
      audience: eightOwners(),
      projectId: null,
      projectName: null,
      nowMs: NOW_MS + 1,
    });

    const suppressed = second.skipped.find((s) => s.ownerKey === optedOut.ownerKey);
    expect(suppressed).toBeDefined();
    expect(suppressed?.reason).toBe("Opted out of a previous simulated campaign — suppressed.");

    const afterState = getSnapshot();
    const secondCampaign = afterState.campaigns.find((c) => c.id === second.campaignIds[0])!;
    const messageForOptedOutOwner = afterState.messages.find(
      (m) => m.campaignId === secondCampaign.id && m.ownerKey === optedOut.ownerKey,
    );
    expect(messageForOptedOutOwner).toBeUndefined();
  });
});
