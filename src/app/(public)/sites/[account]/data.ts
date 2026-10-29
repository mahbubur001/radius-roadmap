import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { publicTag, siteTag } from "@/server/public-cache";
import {
  getPublicArticle,
  getPublicArticleCategory,
  getPublicKnowledgeBase,
  searchPublicArticles,
} from "@/server/services/public-articles";
import {
  getPublicIdea,
  getPublicIdeas,
  type IdeaSort,
} from "@/server/services/public-ideas";
import {
  getPublicCard,
  getPublicRoadmap,
  getPublicWorkspace,
  listPublicWorkspaces,
  resolveSite,
} from "@/server/services/public-site";
import {
  getPublicUpdate,
  listPublicUpdates,
} from "@/server/services/public-updates";
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

export async function loadIdeas(
  accountId: string,
  workspaceId: string,
  opts: { board?: string; q?: string; sort?: IdeaSort; status?: string },
) {
  "use cache";
  cacheLife("hours");
  cacheTag(publicTag(workspaceId));
  return getPublicIdeas(db, { accountId }, workspaceId, opts);
}

export async function loadIdea(
  accountId: string,
  workspaceId: string,
  slug: string,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(publicTag(workspaceId));
  return getPublicIdea(db, { accountId }, workspaceId, slug);
}

// Updates use a short lifetime as well as tags: a scheduled post goes live
// from the worker, which refreshes the cache through a signed call but may
// miss (doc 23 step 3).
export async function loadUpdates(
  accountId: string,
  workspaceId: string,
  opts: { q?: string; category?: string },
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(publicTag(workspaceId));
  const data = await listPublicUpdates(db, { accountId }, workspaceId, opts);
  return {
    ...data,
    posts: data.posts.map((p) => ({ ...p, cover: fileUrl(p.cover) })),
  };
}

export async function loadUpdate(
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

export async function loadKnowledgeBase(
  accountId: string,
  workspaceId: string,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(publicTag(workspaceId));
  return getPublicKnowledgeBase(db, { accountId }, workspaceId);
}

export async function loadArticleCategory(
  accountId: string,
  workspaceId: string,
  slug: string,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(publicTag(workspaceId));
  return getPublicArticleCategory(db, { accountId }, workspaceId, slug);
}

export async function loadArticle(
  accountId: string,
  workspaceId: string,
  slug: string,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(publicTag(workspaceId));
  return getPublicArticle(db, { accountId }, workspaceId, slug);
}

export async function loadArticleSearch(
  accountId: string,
  workspaceId: string,
  q: string,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(publicTag(workspaceId));
  return searchPublicArticles(db, { accountId }, workspaceId, q);
}

/** Absolute base URL of a public site (<app>/<account>), for canonical URLs and sitemaps. */
export function siteUrl(account: string) {
  return `${new URL(env.NEXT_PUBLIC_APP_URL).origin}/${account}`;
}
