import { describe, expect, it } from "vitest";
import {
  signInternal,
  signLink,
  verifyInternal,
  verifyLink,
} from "./internal-signature";

const secret = "s".repeat(32);

describe("internal signatures", () => {
  it("accepts a fresh, matching signature only", () => {
    const now = Date.now();
    const sig = signInternal(secret, "acct:ws", now);
    expect(verifyInternal(secret, "acct:ws", now, sig, now)).toBe(true);
    expect(verifyInternal(secret, "acct:other", now, sig, now)).toBe(false);
    expect(verifyInternal("x".repeat(32), "acct:ws", now, sig, now)).toBe(
      false,
    );
    expect(
      verifyInternal(secret, "acct:ws", now, sig, now + 6 * 60 * 1000),
    ).toBe(false);
  });
});

describe("link signatures", () => {
  it("verify only the signed payload and secret", () => {
    const sig = signLink(secret, "unsub:abc");
    expect(verifyLink(secret, "unsub:abc", sig)).toBe(true);
    expect(verifyLink(secret, "unsub:abd", sig)).toBe(false);
    expect(verifyLink("y".repeat(32), "unsub:abc", sig)).toBe(false);
  });
});
