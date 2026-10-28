import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { publicTag, siteTag } from "@/server/public-cache";
import {
  getPublicCard,
  getPublicRoadmap,
  getPublicWorkspace,
  listPublicWorkspaces,
  resolveSite,
} from "@/server/services/public-site";
import { fileUrl } from "@/server/storage";

// Cached reads for the public site. Roadmap data is tagged per workspace and
// dropped by invalidatePublic() whenever the team or a voter changes it.
// Visitor-specific state (own votes, sign-in) is never cached here.

export async function loadSite(account: string) {
  "use cache";
  cacheLife("minutes");
  const site = await resolveSite(db, account);
  if (site) cacheTag(siteTag(site.accountId));
  return site ? { ...site, logoUrl: fileUrl(site.logo) } : null;
}

export async function loadWorkspaces(accountId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(siteTag(accountId));
  return listPublicWorkspaces(db, { accountId });
}

export async function loadWorkspace(accountId: string, slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(siteTag(accountId));
  const ws = await getPublicWorkspace(db, { accountId }, slug);
  if (!ws) return null;
  cacheTag(publicTag(ws.id));
  return { ...ws, logoUrl: fileUrl(ws.logo) };
}

export async function loadRoadmap(
  accountId: string,
  workspaceId: string,
  slug: string | undefined,
  q: string | undefined,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(publicTag(workspaceId));
  return getPublicRoadmap(db, { accountId }, workspaceId, { slug, q });
}

export async function loadCard(
  accountId: string,
  workspaceId: string,
  slug: string,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(publicTag(workspaceId));
  return getPublicCard(db, { accountId }, workspaceId, slug);
}

/** Absolute base URL of a public site (<app>/<account>), for canonical URLs and sitemaps. */
export function siteUrl(account: string) {
  return `${new URL(env.NEXT_PUBLIC_APP_URL).origin}/${account}`;
}
