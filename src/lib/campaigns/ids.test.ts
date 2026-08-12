import { describe, expect, it } from "vitest";
import { base62, campaignId, eventId, messageId, shortToken } from "./ids";

describe("base62", () => {
  it("pads to the requested length", () => {
    expect(base62(0, 5)).toBe("00000");
  });

  it("encodes 61 as the last base62 digit", () => {
    expect(base62(61, 5)).toBe("0000z");
  });
});

describe("shortToken", () => {
  it("is exactly 10 base62 characters", () => {
    const token = shortToken("anything");
    expect(token.length).toBe(10);
    expect(token).toMatch(/^[0-9A-Za-z]{10}$/);
  });

  it("is deterministic per seed and differs across seeds", () => {
    expect(shortToken("a")).toBe(shortToken("a"));
    expect(shortToken("a")).not.toBe(shortToken("b"));
  });

  it("produces 5,000 distinct tokens for 5,000 distinct seeds", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      tokens.add(shortToken(`seed-${i}`));
    }
    expect(tokens.size).toBe(5000);
  });
});

describe("id constructors", () => {
  it("prefix and length are exact", () => {
    expect(campaignId("x").startsWith("cmp_")).toBe(true);
    expect(messageId("x").startsWith("msg_")).toBe(true);
    expect(eventId("x").startsWith("ev_")).toBe(true);

    expect(campaignId("x").length).toBe(4 + 10);
    expect(messageId("x").length).toBe(4 + 10);
    expect(eventId("x").length).toBe(3 + 10);
  });
});
