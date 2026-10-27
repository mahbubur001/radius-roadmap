import "server-only";
import { revalidateTag } from "next/cache";

// Public pages cache their data with `"use cache"` + cacheTag(publicTag(…)).
// Anything that changes what a workspace's public site shows calls
// invalidatePublic so the next visitor gets fresh data.

export function publicTag(workspaceId: string) {
  return `ws:${workspaceId}`;
}

/** Account-level data: site name/logo and the list of public workspaces. */
export function siteTag(accountId: string) {
  return `site:${accountId}`;
}

export function invalidatePublic(workspaceId: string) {
  revalidateTag(publicTag(workspaceId), { expire: 0 });
}

export function invalidateSite(accountId: string) {
  revalidateTag(siteTag(accountId), { expire: 0 });
}
