import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { IMAGE_TYPES, type ImageType } from "@/lib/schemas/upload";

// Pure helpers (no env access) so they can be unit-tested.

const KEY_PATTERN =
  /^(?:[A-Za-z0-9_-]+\/)+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/;

/** Storage prefixes. A tenant can only ever write under its own prefix. */
export const prefixes = {
  avatar: (userId: string) => `users/${userId}/avatar`,
  accountLogo: (accountId: string) => `accounts/${accountId}/logo`,
  workspaceLogo: (accountId: string, workspaceId: string) =>
    `accounts/${accountId}/workspaces/${workspaceId}/logo`,
};

export function newKey(prefix: string, contentType: ImageType) {
  return `${prefix}/${randomUUID()}.${IMAGE_TYPES[contentType]}`;
}

export function isValidKey(key: string) {
  return KEY_PATTERN.test(key) && !key.includes("..");
}

/** True when `key` is a well-formed key directly under `prefix`. */
export function keyHasPrefix(key: string, prefix: string) {
  if (!isValidKey(key) || !key.startsWith(`${prefix}/`)) return false;
  return !key.slice(prefix.length + 1).includes("/");
}

export function contentTypeForKey(key: string): ImageType | null {
  const ext = key.split(".").pop();
  const entry = Object.entries(IMAGE_TYPES).find(([, e]) => e === ext);
  return (entry?.[0] as ImageType | undefined) ?? null;
}

// Local driver: short-lived HMAC token standing in for S3's signed policy.

function payload(key: string, contentType: string, expires: number) {
  return `${key}\n${contentType}\n${expires}`;
}

export function signUpload(
  secret: string,
  key: string,
  contentType: string,
  expires: number,
) {
  return createHmac("sha256", `uploads:${secret}`)
    .update(payload(key, contentType, expires))
    .digest("base64url");
}

export function verifyUpload(
  secret: string,
  token: string,
  key: string,
  contentType: string,
  expires: number,
  now = Date.now(),
) {
  if (!Number.isFinite(expires) || expires < now) return false;
  const expected = Buffer.from(signUpload(secret, key, contentType, expires));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Checks the file's magic bytes match the declared image type. */
export function sniffImage(bytes: Uint8Array, contentType: ImageType) {
  const at = (i: number) => bytes[i] ?? -1;
  switch (contentType) {
    case "image/png":
      return (
        at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47
      );
    case "image/jpeg":
      return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
    case "image/webp":
      return (
        String.fromCharCode(at(0), at(1), at(2), at(3)) === "RIFF" &&
        String.fromCharCode(at(8), at(9), at(10), at(11)) === "WEBP"
      );
  }
}
