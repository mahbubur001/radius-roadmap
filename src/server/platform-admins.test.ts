import { describe, expect, it } from "vitest";
import { isPlatformAdmin } from "./platform-admins";

// Who may open /admin (doc 28 C1).

describe("platform admins", () => {
  const list = " Boss@Example.com , ops@example.com,,";

  it("are the listed, verified emails, any case", () => {
    expect(isPlatformAdmin("boss@example.com", true, list)).toBe(true);
    expect(isPlatformAdmin("OPS@example.com", true, list)).toBe(true);
  });

  it("never unverified emails, others, or anyone when the list is empty", () => {
    expect(isPlatformAdmin("boss@example.com", false, list)).toBe(false);
    expect(isPlatformAdmin("someone@example.com", true, list)).toBe(false);
    expect(isPlatformAdmin("boss@example.com", true, "")).toBe(false);
    expect(isPlatformAdmin("boss@example.com", true, undefined)).toBe(false);
    expect(isPlatformAdmin("", true, list)).toBe(false);
  });
});
