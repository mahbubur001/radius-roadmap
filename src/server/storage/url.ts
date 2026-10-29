import { env } from "@/lib/env";

// Public URL of a stored file. Kept apart from ./index (server-only: fs, S3
// client) so the worker can build URLs for emails too.

/** Public URL for a stored key (null stays null). */
export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  // Avatars from Google sign-in are already full URLs.
  if (/^https?:\/\//.test(key)) return key;
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET && !env.S3_PUBLIC_URL) {
      throw new Error("S3_BUCKET is not set.");
    }
    const base =
      env.S3_PUBLIC_URL ?? `https://${env.S3_BUCKET}.s3.amazonaws.com`;
    return `${base}/${key}`;
  }
  return `/api/files/${key}`;
}
