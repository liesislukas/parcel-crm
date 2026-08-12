import { fnv1a32 } from "@/lib/owners";

export const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Deterministic base62 encoding of a 32-bit unsigned value, left-padded (or truncated to
 * its last `length` characters) to exactly `length` characters. Total for any 32-bit
 * input.
 */
export function base62(value: number, length: number): string {
  let n = value >>> 0;
  let out = "";
  if (n === 0) {
    out = "0";
  } else {
    while (n > 0) {
      out = BASE62[n % 62] + out;
      n = Math.floor(n / 62);
    }
  }
  out = out.padStart(length, "0");
  if (out.length > length) {
    out = out.slice(out.length - length);
  }
  return out;
}

/** Exactly 10 characters — the kit's short-URL token contract. */
export function shortToken(seed: string): string {
  return base62(fnv1a32(seed), 5) + base62(fnv1a32(seed + "|2"), 5);
}

export function campaignId(seed: string): string {
  return `cmp_${shortToken(seed)}`;
}

export function messageId(seed: string): string {
  return `msg_${shortToken(seed)}`;
}

export function eventId(seed: string): string {
  return `ev_${shortToken(seed)}`;
}
