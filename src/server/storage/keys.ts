import { randomUUID } from "node:crypto";
import {
  ATTACHMENT_TYPES,
  type AttachmentType,
  type ImageType,
} from "@/lib/schemas/upload";

// Pure helpers (no env access) so they can be unit-tested.

const KEY_PATTERN =
  /^(?:[A-Za-z0-9_-]+\/)+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp|pdf)$/;

/** Storage prefixes. A tenant can only ever write under its own prefix. */
export const prefixes = {
  avatar: (userId: string) => `users/${userId}/avatar`,
  /** Everything an account stored (deleted with the account). */
  account: (accountId: string) => `accounts/${accountId}/`,
  accountLogo: (accountId: string) => `accounts/${accountId}/logo`,
  accountFavicon: (accountId: string) => `accounts/${accountId}/favicon`,
  workspaceLogo: (accountId: string, workspaceId: string) =>
    `accounts/${accountId}/workspaces/${workspaceId}/logo`,
  /** Images inside roadmap card descriptions. */
  cardImages: (accountId: string, workspaceId: string) =>
    `accounts/${accountId}/workspaces/${workspaceId}/cards`,
  /** Files attached to roadmap cards (doc 21 step C). */
  cardAttachments: (accountId: string, workspaceId: string) =>
    `accounts/${accountId}/workspaces/${workspaceId}/card-files`,
};

export function newKey(prefix: string, contentType: AttachmentType) {
  return `${prefix}/${randomUUID()}.${ATTACHMENT_TYPES[contentType]}`;
}

export function isValidKey(key: string) {
  return KEY_PATTERN.test(key) && !key.includes("..");
}

/** True when `key` is a well-formed key directly under `prefix`. */
export function keyHasPrefix(key: string, prefix: string) {
  if (!isValidKey(key) || !key.startsWith(`${prefix}/`)) return false;
  return !key.slice(prefix.length + 1).includes("/");
}

export function contentTypeForKey(key: string): AttachmentType | null {
  const ext = key.split(".").pop();
  const entry = Object.entries(ATTACHMENT_TYPES).find(([, e]) => e === ext);
  return (entry?.[0] as AttachmentType | undefined) ?? null;
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

/** Checks the file's magic bytes match the declared type (images or PDF). */
export function sniffFile(bytes: Uint8Array, contentType: AttachmentType) {
  if (contentType === "application/pdf") {
    return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  }
  return sniffImage(bytes, contentType);
}
