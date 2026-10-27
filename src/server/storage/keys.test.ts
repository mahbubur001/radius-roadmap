import { describe, expect, it } from "vitest";
import {
  isValidKey,
  keyHasPrefix,
  newKey,
  prefixes,
  signUpload,
  sniffImage,
  verifyUpload,
} from "./keys";

const secret = "x".repeat(32);

describe("storage keys", () => {
  it("builds keys under the tenant prefix", () => {
    const prefix = prefixes.accountLogo("acct_1");
    const key = newKey(prefix, "image/png");
    expect(key).toMatch(/^accounts\/acct_1\/logo\/[0-9a-f-]{36}\.png$/);
    expect(keyHasPrefix(key, prefix)).toBe(true);
  });

  it("rejects keys from another tenant or with traversal", () => {
    const key = newKey(prefixes.accountLogo("acct_2"), "image/png");
    expect(keyHasPrefix(key, prefixes.accountLogo("acct_1"))).toBe(false);
    expect(isValidKey("accounts/../etc/passwd")).toBe(false);
    expect(isValidKey("accounts/a/logo/x.svg")).toBe(false);
    // A key nested deeper than the prefix doesn't count as under it.
    const nested = newKey(
      `${prefixes.accountLogo("acct_1")}/extra`,
      "image/png",
    );
    expect(keyHasPrefix(nested, prefixes.accountLogo("acct_1"))).toBe(false);
  });
});

describe("local upload tokens", () => {
  const key = newKey(prefixes.avatar("u1"), "image/png");
  const expires = Date.now() + 60_000;
  const token = signUpload(secret, key, "image/png", expires);

  it("accepts a valid token", () => {
    expect(verifyUpload(secret, token, key, "image/png", expires)).toBe(true);
  });

  it("rejects another key, type, secret or an expired token", () => {
    const other = newKey(prefixes.avatar("u2"), "image/png");
    expect(verifyUpload(secret, token, other, "image/png", expires)).toBe(
      false,
    );
    expect(verifyUpload(secret, token, key, "image/jpeg", expires)).toBe(false);
    expect(verifyUpload("y".repeat(32), token, key, "image/png", expires)).toBe(
      false,
    );
    expect(
      verifyUpload(secret, token, key, "image/png", expires, expires + 1),
    ).toBe(false);
  });
});

describe("sniffImage", () => {
  it("matches magic bytes to the declared type", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(sniffImage(png, "image/png")).toBe(true);
    expect(sniffImage(png, "image/jpeg")).toBe(false);
    const html = new TextEncoder().encode("<svg onload=alert(1)>");
    expect(sniffImage(html, "image/png")).toBe(false);
  });
});
