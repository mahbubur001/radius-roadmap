import { and, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import type { ReactionCounts } from "@/lib/reactions";
import { renderRichText } from "@/lib/rich-text";
import type { Db } from "@/server/db/client";
import {
  roadmapCards,
  roadmapColumns,
  roadmaps,
  updateCards,
  updateCategories,
  updates,
  workspaces,
} from "@/server/db/schema";
import { likePattern } from "./cards";
import type { PublicContext } from "./context";
import { byPosition } from "./positions";
import { reactionCounts } from "./reactions";

// The public Updates pages (doc 23 step 3). The account comes from the URL.
// Visitors see published, public posts of workspaces that show Updates.

/** Needs no join: the workspace check is a subquery (table-qualified). */
export const postIsPublic = and(
  eq(updates.status, "published"),
  eq(updates.isPublic, true),
  sql`not exists (select 1 from ${workspaces} hidden where hidden.id = "updates"."workspace_id" and hidden.settings->>'showUpdates' = 'false')`,
) as SQL;

export type PublicPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover: string | null;
  category: { id: string; name: string; color: string } | null;
  pinned: boolean;
  publishedAt: string;
  reactions: ReactionCounts;
};

function postColumns() {
  return {
    id: updates.id,
    slug: updates.slug,
    title: updates.title,
    bodyText: updates.bodyText,
    bodyJson: updates.bodyJson,
    cover: updates.cover,
    pinned: updates.pinned,
    publishedAt: updates.publishedAt,
    categoryId: updateCategories.id,
    categoryName: updateCategories.name,
    categoryColor: updateCategories.color,
  };
}

function toPost(r: {
  id: string;
  slug: string;
  title: string;
  bodyText: string;
  cover: string | null;
  pinned: boolean;
  publishedAt: Date | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
}): PublicPost {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.bodyText.slice(0, 280) || null,
    cover: r.cover,
    pinned: r.pinned,
    publishedAt: (r.publishedAt ?? new Date(0)).toISOString(),
    reactions: {},
    category:
      r.categoryId && r.categoryName && r.categoryColor
        ? { id: r.categoryId, name: r.categoryName, color: r.categoryColor }
        : null,
  };
}

export async function hasPublicUpdates(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
) {
  const [row] = await db
    .select({ id: updates.id })
    .from(updates)
    .where(
      and(
        eq(updates.accountId, ctx.accountId),
        eq(updates.workspaceId, workspaceId),
        postIsPublic,
      ),
    )
    .limit(1);
  return !!row;
}

/** The Updates page: pinned first, newest first; search and category. */
export async function listPublicUpdates(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  opts: { q?: string; category?: string; limit?: number } = {},
) {
  const where: SQL[] = [
    eq(updates.accountId, ctx.accountId),
    eq(updates.workspaceId, workspaceId),
    postIsPublic,
  ];
  if (opts.category) where.push(eq(updates.categoryId, opts.category));
  if (opts.q) {
    where.push(
      or(
        sql`${updates.search} @@ websearch_to_tsquery('english', ${opts.q})`,
        ilike(updates.title, likePattern(opts.q)),
      ) as SQL,
    );
  }
  const [rows, categories] = await Promise.all([
    db
      .select(postColumns())
      .from(updates)
      .leftJoin(updateCategories, eq(updateCategories.id, updates.categoryId))
      .where(and(...where))
      .orderBy(desc(updates.pinned), desc(updates.publishedAt))
      .limit(opts.limit ?? 100),
    db
      .select({
        id: updateCategories.id,
        name: updateCategories.name,
        color: updateCategories.color,
      })
      .from(updateCategories)
      .where(
        and(
          eq(updateCategories.accountId, ctx.accountId),
          eq(updateCategories.workspaceId, workspaceId),
        ),
      )
      .orderBy(byPosition(updateCategories.position)),
  ]);
  const posts = rows.map(toPost);
  const counts = await reactionCounts(
    db,
    ctx,
    posts.map((p) => p.id),
  );
  return {
    posts: posts.map((p) => ({ ...p, reactions: counts[p.id] ?? {} })),
    categories,
  };
}

/** One post with its body and the public roadmap cards it shipped. */
export async function getPublicUpdate(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  slug: string,
) {
  const [row] = await db
    .select(postColumns())
    .from(updates)
    .leftJoin(updateCategories, eq(updateCategories.id, updates.categoryId))
    .where(
      and(
        eq(updates.accountId, ctx.accountId),
        eq(updates.workspaceId, workspaceId),
        eq(updates.slug, slug),
        postIsPublic,
      ),
    )
    .limit(1);
  if (!row) return null;
  const cards = await db
    .select({
      slug: roadmapCards.slug,
      title: sql<string>`coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title})`,
    })
    .from(updateCards)
    .innerJoin(roadmapCards, eq(roadmapCards.id, updateCards.cardId))
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
    .innerJoin(workspaces, eq(workspaces.id, roadmaps.workspaceId))
    .where(
      and(
        eq(updateCards.updateId, row.id),
        eq(roadmapCards.isPublic, true),
        sql`${roadmapCards.archivedAt} is null`,
        eq(roadmaps.isPublic, true),
        eq(roadmapColumns.isPublic, true),
        sql`coalesce(${workspaces.settings}->>'showRoadmap', 'true') <> 'false'`,
      ),
    );
  const counts = await reactionCounts(db, ctx, [row.id]);
  return {
    ...toPost(row),
    reactions: counts[row.id] ?? {},
    html: renderRichText(row.bodyJson) || null,
    cards,
  };
}

/** Status of /<ws>/updates[/<slug>] for the proxy. */
export async function updatePathStatus(
  db: Db,
  ctx: PublicContext,
  ws: string,
  slug: string | undefined,
): Promise<"ok" | "missing"> {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(eq(workspaces.accountId, ctx.accountId), eq(workspaces.slug, ws)),
    )
    .limit(1);
  if (!workspace) return "missing";
  if (!slug || slug === "feed.xml") {
    return (await hasPublicUpdates(db, ctx, workspace.id)) ? "ok" : "missing";
  }
  return (await getPublicUpdate(db, ctx, workspace.id, slug))
    ? "ok"
    : "missing";
}

/** Published public posts for sitemap.xml. */
export async function listUpdateSitemapEntries(db: Db, ctx: PublicContext) {
  return db
    .select({
      workspace: workspaces.slug,
      post: updates.slug,
      updatedAt: updates.updatedAt,
      indexable: sql<boolean>`coalesce((${workspaces.settings}->>'indexPublicPages')::boolean, true)`,
    })
    .from(updates)
    .innerJoin(workspaces, eq(workspaces.id, updates.workspaceId))
    .where(and(eq(updates.accountId, ctx.accountId), postIsPublic));
}

/** A post visitors may react to, or null. */
export async function getReactablePost(
  db: Db,
  ctx: PublicContext,
  updateId: string,
) {
  const [row] = await db
    .select({ id: updates.id, workspaceId: updates.workspaceId })
    .from(updates)
    .where(
      and(
        eq(updates.accountId, ctx.accountId),
        eq(updates.id, updateId),
        postIsPublic,
      ),
    )
    .limit(1);
  return row ?? null;
}
