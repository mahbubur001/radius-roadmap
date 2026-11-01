import { describe, expect, it } from "vitest";
import {
  isValidKey,
  keyHasPrefix,
  newKey,
  prefixes,
  sniffFile,
  sniffImage,
} from "./keys";

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

describe("sniffImage", () => {
  it("matches magic bytes to the declared type", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(sniffImage(png, "image/png")).toBe(true);
    expect(sniffImage(png, "image/jpeg")).toBe(false);
    const html = new TextEncoder().encode("<svg onload=alert(1)>");
    expect(sniffImage(html, "image/png")).toBe(false);
  });
});

describe("card attachments", () => {
  const prefix = prefixes.cardAttachments("acct_1", "ws_1");

  it("allows PDF keys under the attachments prefix", () => {
    const pdf = newKey(prefix, "application/pdf");
    expect(pdf).toMatch(/\.pdf$/);
    expect(isValidKey(pdf)).toBe(true);
    expect(keyHasPrefix(pdf, prefix)).toBe(true);
  });

  it("checks PDF magic bytes", () => {
    const enc = new TextEncoder();
    expect(sniffFile(enc.encode("%PDF-1.7\n"), "application/pdf")).toBe(true);
    expect(sniffFile(enc.encode("<html>"), "application/pdf")).toBe(false);
    expect(sniffFile(enc.encode("%PDF-1.7"), "image/png")).toBe(false);
  });
});

describe("favicons", () => {
  it("live under the account's favicon prefix", () => {
    const icon = newKey(prefixes.accountFavicon("acct_1"), "image/png");
    expect(keyHasPrefix(icon, prefixes.accountFavicon("acct_1"))).toBe(true);
    expect(keyHasPrefix(icon, prefixes.accountLogo("acct_1"))).toBe(false);
  });
});

describe("R2 presigned PUT (doc 29 T11)", () => {
  it("signs the content type and exact length, on the R2 endpoint", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { presignPut } = await import("./index");
    const client = new S3Client({
      region: "auto",
      endpoint: "https://acct123.r2.cloudflarestorage.com",
      credentials: { accessKeyId: "AKID", secretAccessKey: "secret" },
    });
    const key = newKey(prefixes.cardImages("a1", "w1"), "image/png");
    const url = new URL(
      await presignPut(
        { client, bucket: "files" },
        key,
        "image/png",
        1234,
        null,
      ),
    );
    expect(url.host).toBe("files.acct123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/${key}`);
    const signed = url.searchParams.get("X-Amz-SignedHeaders")?.split(";");
    expect(signed).toEqual(
      expect.arrayContaining(["content-length", "content-type", "host"]),
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");

    const pdf = new URL(
      await presignPut(
        { client, bucket: "files" },
        newKey(prefixes.cardAttachments("a1", "w1"), "application/pdf"),
        "application/pdf",
        99,
        "attachment",
      ),
    );
    expect(pdf.searchParams.get("X-Amz-SignedHeaders")).toContain(
      "content-disposition",
    );
  });
});
