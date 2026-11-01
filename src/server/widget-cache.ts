import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import { publicTag, siteTag } from "@/server/public-cache";
import { activeHostname } from "@/server/services/custom-domains";
import { getPublicUpdate } from "@/server/services/public-updates";
import { widgetSite } from "@/server/services/widget";
import { fileUrl } from "@/server/storage";

// Cached widget data, dropped with the public site's cache (posts, settings,
// reactions and plan changes all call invalidatePublic / invalidateSite).

export async function loadWidgetSite(accountId: string, workspace: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(siteTag(accountId));
  const site = await widgetSite(db, { accountId }, workspace);
  if (!site) return null;
  cacheTag(publicTag(site.workspace.id));
  return {
    ...site,
    /** The account's live custom domain, for links (doc 26 D5). */
    customHost: await activeHostname(db, accountId),
    workspace: { ...site.workspace, logo: fileUrl(site.workspace.logo) },
    posts: site.posts.map((p) => ({ ...p, cover: fileUrl(p.cover) })),
  };
}

export async function loadWidgetPost(
  accountId: string,
  workspaceId: string,
  slug: string,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(publicTag(workspaceId));
  const post = await getPublicUpdate(db, { accountId }, workspaceId, slug);
  return post ? { ...post, cover: fileUrl(post.cover) } : null;
}
