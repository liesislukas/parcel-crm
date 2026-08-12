import { describe, expect, it } from "vitest";
import { CHANNELS, countsFrom, type FactType } from "@/lib/campaigns/model";
import { OUTCOME_PATHS, planEvents, simulatedAt } from "./simulate";

describe("OUTCOME_PATHS", () => {
  it("has exactly 8 paths per channel", () => {
    expect(OUTCOME_PATHS.email.length).toBe(8);
    expect(OUTCOME_PATHS.sms.length).toBe(8);
    expect(OUTCOME_PATHS.direct_mail.length).toBe(8);
  });

  it("never includes message.opened for sms or direct_mail", () => {
    for (const path of OUTCOME_PATHS.sms) {
      expect(path.includes("message.opened")).toBe(false);
    }
    for (const path of OUTCOME_PATHS.direct_mail) {
      expect(path.includes("message.opened")).toBe(false);
    }
  });

  it("has exactly one bounce path and one opt-out path per channel", () => {
    for (const channel of CHANNELS) {
      const bounced = OUTCOME_PATHS[channel].filter((p) => p.includes("message.bounced"));
      const optedOut = OUTCOME_PATHS[channel].filter((p) => p.includes("message.opted_out"));
      expect(bounced.length).toBe(1);
      expect(optedOut.length).toBe(1);
    }
  });
});

describe("planEvents", () => {
  it("always returns tick offsets in non-decreasing order, for every channel, path and jitter value", () => {
    for (const channel of CHANNELS) {
      for (let pathIndex = 0; pathIndex < OUTCOME_PATHS[channel].length; pathIndex++) {
        for (let i = 0; i < 200; i++) {
          const messageId = `msg_synthetic_${channel}_${pathIndex}_${i}`;
          const recipientIndex = pathIndex; // outcomePathIndex(i, channel) === i % 8
          const events = planEvents(channel, recipientIndex, messageId, 0);
          for (let k = 1; k < events.length; k++) {
            expect(events[k].tickOffset).toBeGreaterThanOrEqual(events[k - 1].tickOffset);
          }
        }
      }
    }
  });

  it("email recipient 5 (path index 5) bounces and nothing follows", () => {
    const events = planEvents("email", 5, "msg_test000001", 0);
    expect(events.map((e) => e.factType)).toEqual([
      "message.queued",
      "message.sent",
      "message.bounced",
    ]);
  });

  it("direct_mail delivery never lands before tick offset 5", () => {
    const events = planEvents("direct_mail", 0, "msg_test000002", 0);
    const delivered = events.find((e) => e.factType === "message.delivered");
    expect(delivered).toBeDefined();
    expect([5, 6]).toContain(delivered!.tickOffset);
  });

  it("baseTick shifts the whole schedule, including message.queued", () => {
    const events = planEvents("email", 0, "msg_test000003", 4);
    expect(events[0].factType).toBe("message.queued");
    expect(events[0].tickOffset).toBe(4);
  });

  it("folding the eight email paths gives the predicted demo counts", () => {
    const messageIds: string[] = [];
    const facts: { messageId: string; factType: FactType }[] = [];

    for (let i = 0; i < 8; i++) {
      const messageId = `msg_email_recipient_${i}`;
      messageIds.push(messageId);
      const events = planEvents("email", i, messageId, 0);
      for (const e of events) {
        facts.push({ messageId, factType: e.factType });
      }
    }

    const counts = countsFrom(messageIds, facts);
    expect(counts.sent).toBe(8);
    expect(counts.delivered).toBe(7);
    expect(counts.opened).toBe(6);
    expect(counts.clicked).toBe(4);
    expect(counts.replied).toBe(2);
    expect(counts.bounced).toBe(1);
  });
});

describe("simulatedAt", () => {
  it("converts tick offsets to ISO timestamps at TICK_HOURS per tick", () => {
    expect(simulatedAt(0, 2)).toBe("1970-01-02T00:00:00.000Z");
  });
});
