import { beforeEach, describe, expect, it } from "vitest";
import type { Owner } from "@/lib/owners";
import { countsFrom } from "@/lib/campaigns/model";
import { createCampaigns, getSnapshot, resetAll, runToCompletion } from "@/lib/campaigns/store";
import {
  SEEDED_AUDIENCE_OWNER_NAMES,
  SEEDED_CAMPAIGN_CHANNELS,
  SEEDED_CAMPAIGN_NAME,
  SEEDED_PROJECT_ID,
} from "@/lib/demo/seedData";

/**
 * `src/lib/campaigns/store.ts` works under `environment: "node"` without a localStorage
 * stub — it guards on `typeof window === "undefined"` and keeps state in its module cache,
 * exactly how `src/lib/campaigns/store.test.ts` already exercises it.
 *
 * Seven synthetic owners, in `SEEDED_AUDIENCE_OWNER_NAMES` order, all mailable on every
 * channel — the same property `seedData.test.ts` already verified against the real county
 * file for these exact seven names. The counts below depend only on channel and recipient
 * index (`recipientIndex % 8` into `src/lib/campaigns/simulate.ts`'s path tables), so
 * synthetic owners give the identical answer real ones would.
 */
function syntheticAudience(): Owner[] {
  return SEEDED_AUDIENCE_OWNER_NAMES.map((ownerName, i) => ({
    ownerKey: `seed-audience-${i}`,
    ownerName,
    parcelPins: [`P${i}`],
    parcelCount: 1,
    totalAcres: 10,
    mailingStreet: "1 MAIN ST",
    mailingCityStateZip: "ROCK ISLAND IL 61201",
  }));
}

type ChannelCounts = Record<
  "email" | "sms" | "direct_mail",
  {
    messages: number;
    sent: number;
    delivered: number;
    clicked: number;
    replied: number;
    bounced: number;
    opened: number;
    loggedIn: number;
    optedOut: number;
  }
>;

const EXPECTED: ChannelCounts = {
  email: {
    messages: 7,
    sent: 7,
    delivered: 6,
    clicked: 3,
    replied: 2,
    bounced: 1,
    opened: 5,
    loggedIn: 1,
    optedOut: 1,
  },
  sms: {
    messages: 7,
    sent: 7,
    delivered: 6,
    clicked: 3,
    replied: 3,
    bounced: 1,
    opened: 0,
    loggedIn: 1,
    optedOut: 1,
  },
  direct_mail: {
    messages: 7,
    sent: 7,
    delivered: 6,
    clicked: 3,
    replied: 3,
    bounced: 1,
    opened: 0,
    loggedIn: 1,
    optedOut: 1,
  },
};

function runSeededCampaign() {
  const result = createCampaigns({
    name: SEEDED_CAMPAIGN_NAME,
    channels: SEEDED_CAMPAIGN_CHANNELS,
    audience: syntheticAudience(),
    projectId: SEEDED_PROJECT_ID,
    projectName: "Columbia Business Park Assemblage",
    nowMs: 1_786_000_000_000,
  });
  runToCompletion();
  return result;
}

describe("the seeded campaign's lifecycle counts are deterministic", () => {
  beforeEach(() => {
    resetAll();
  });

  it("creates three campaigns — email, sms, direct_mail — all simulated, none skipped", () => {
    const result = runSeededCampaign();
    const state = getSnapshot();

    expect(state.campaigns).toHaveLength(3);
    expect(state.campaigns.map((c) => c.channel)).toEqual(["email", "sms", "direct_mail"]);
    for (const campaign of state.campaigns) {
      expect(campaign.projectId).toBe(SEEDED_PROJECT_ID);
      expect(campaign.simulated).toBe(true);
    }
    expect(result.skipped).toEqual([]);
  });

  it("matches the predicted counts exactly, for every channel", () => {
    runSeededCampaign();
    const state = getSnapshot();

    for (const channel of ["email", "sms", "direct_mail"] as const) {
      const campaign = state.campaigns.find((c) => c.channel === channel)!;
      const messageIds = state.messages
        .filter((m) => m.campaignId === campaign.id)
        .map((m) => m.id);
      const facts = state.events
        .filter((e) => messageIds.includes(e.messageId))
        .map((e) => ({ messageId: e.messageId, factType: e.factType }));

      expect(countsFrom(messageIds, facts)).toEqual(EXPECTED[channel]);
    }
  });

  it("is repeatable: a second reset-and-run produces identical counts", () => {
    runSeededCampaign();
    const state1 = getSnapshot();
    const email1 = state1.campaigns.find((c) => c.channel === "email")!;
    const ids1 = state1.messages.filter((m) => m.campaignId === email1.id).map((m) => m.id);
    const facts1 = state1.events
      .filter((e) => ids1.includes(e.messageId))
      .map((e) => ({ messageId: e.messageId, factType: e.factType }));
    const counts1 = countsFrom(ids1, facts1);

    resetAll();
    runSeededCampaign();
    const state2 = getSnapshot();
    const email2 = state2.campaigns.find((c) => c.channel === "email")!;
    const ids2 = state2.messages.filter((m) => m.campaignId === email2.id).map((m) => m.id);
    const facts2 = state2.events
      .filter((e) => ids2.includes(e.messageId))
      .map((e) => ({ messageId: e.messageId, factType: e.factType }));
    const counts2 = countsFrom(ids2, facts2);

    expect(counts2).toEqual(counts1);
    expect(counts1).toEqual(EXPECTED.email);
  });
});
