import { describe, expect, it } from "vitest";
import { signInternal, verifyInternal } from "./internal-signature";

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
