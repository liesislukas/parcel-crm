import { describe, expect, it } from "vitest";
import {
  ALLOWED_FACTS,
  BOUNCE_DETAIL,
  canTransition,
  countsFrom,
  FACT_LABEL,
  messageStateFrom,
} from "./model";

describe("canTransition", () => {
  it("allows email to move from delivered to opened", () => {
    expect(canTransition("email", "delivered", "opened")).toBe(true);
  });

  it("never allows sms or direct_mail into opened — neither channel has an open receipt", () => {
    expect(canTransition("sms", "delivered", "opened")).toBe(false);
    expect(canTransition("direct_mail", "delivered", "opened")).toBe(false);
  });

  it("treats bounced and opted_out as terminal", () => {
    expect(canTransition("email", "bounced", "replied")).toBe(false);
    expect(canTransition("email", "opted_out", "replied")).toBe(false);
  });

  it("never goes backwards", () => {
    expect(canTransition("email", "clicked", "opened")).toBe(false);
  });
});

describe("messageStateFrom", () => {
  it("returns the highest-rank state present", () => {
    expect(
      messageStateFrom([
        "message.queued",
        "message.sent",
        "message.delivered",
        "message.opened",
        "short_url.visited",
      ]),
    ).toBe("clicked");
  });

  it("returns bounced whenever a bounce fact is present, regardless of other facts", () => {
    expect(messageStateFrom(["message.queued", "message.sent", "message.bounced"])).toBe("bounced");
  });

  it("defaults to queued for an empty fact list", () => {
    expect(messageStateFrom([])).toBe("queued");
  });
});

describe("FACT_LABEL", () => {
  it("uses the postal-specific copy for direct_mail", () => {
    expect(FACT_LABEL.direct_mail["message.sent"]).toBe("Mailed");
    expect(FACT_LABEL.direct_mail["message.bounced"]).toBe("Returned to sender");
  });
});

describe("ALLOWED_FACTS", () => {
  it("excludes message.opened for sms", () => {
    expect(ALLOWED_FACTS.sms.includes("message.opened")).toBe(false);
  });
});

describe("BOUNCE_DETAIL", () => {
  it("labels every bounce reason as simulated, per channel", () => {
    expect(BOUNCE_DETAIL.email).toContain("(simulated)");
    expect(BOUNCE_DETAIL.sms).toContain("(simulated)");
    expect(BOUNCE_DETAIL.direct_mail).toContain("(simulated)");
  });
});

describe("countsFrom", () => {
  it("counts each distinct message id once per fact type, proving duplicates count once", () => {
    const counts = countsFrom(
      ["m1", "m2"],
      [
        { messageId: "m1", factType: "message.sent" },
        { messageId: "m1", factType: "message.sent" },
        { messageId: "m2", factType: "message.sent" },
        { messageId: "m1", factType: "message.bounced" },
      ],
    );

    expect(counts.messages).toBe(2);
    expect(counts.sent).toBe(2);
    expect(counts.bounced).toBe(1);
    expect(counts.delivered).toBe(0);
    expect(counts.clicked).toBe(0);
    expect(counts.replied).toBe(0);
  });
});
