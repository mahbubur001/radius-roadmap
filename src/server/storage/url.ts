import { env } from "@/lib/env";

// Public URL of a stored file (R2's public domain). Kept apart from ./index
// (server-only) so the worker can build URLs for emails too.

/** Public URL for a stored key (null stays null). */
export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  // Avatars from Google sign-in are already full URLs.
  if (/^https?:\/\//.test(key)) return key;
  // Not set up yet: pages render without the image instead of failing.
  if (!env.R2_PUBLIC_URL) return null;
  return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}
