import {
  and,
  count,
  desc,
  eq,
  ilike,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { renderRichText } from "@/lib/rich-text";
import type { Db } from "@/server/db/client";
import { articleCategories, articles, workspaces } from "@/server/db/schema";
import { likePattern } from "./cards";
import type { PublicContext } from "./context";
import { byPosition } from "./positions";

// The public Articles pages (doc 25 step 3). The account comes from the URL.
// Visitors see published, public articles of workspaces that show Articles.

/** Needs no join: the workspace check is a subquery (table-qualified). */
export const articleIsPublic = and(
  eq(articles.status, "published"),
  eq(articles.isPublic, true),
  sql`not exists (select 1 from ${workspaces} hidden where hidden.id = "articles"."workspace_id" and hidden.settings->>'showArticles' = 'false')`,
) as SQL;

export type PublicArticleSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: { slug: string; name: string; icon: string } | null;
  publishedAt: string;
  updatedAt: string;
};

function summaryColumns() {
  return {
    id: articles.id,
    slug: articles.slug,
    title: articles.title,
    excerpt: articles.excerpt,
    bodyText: articles.bodyText,
    publishedAt: articles.publishedAt,
    updatedAt: articles.updatedAt,
    categorySlug: articleCategories.slug,
    categoryName: articleCategories.name,
    categoryIcon: articleCategories.icon,
  };
}

type SummaryRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyText: string;
  publishedAt: Date | null;
  updatedAt: Date;
  categorySlug: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
};

function toSummary(r: SummaryRow): PublicArticleSummary {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt || r.bodyText.slice(0, 200),
    category:
      r.categorySlug && r.categoryName && r.categoryIcon
        ? { slug: r.categorySlug, name: r.categoryName, icon: r.categoryIcon }
        : null,
    publishedAt: (r.publishedAt ?? new Date(0)).toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const scope = (ctx: PublicContext, workspaceId: string) =>
  and(
    eq(articles.accountId, ctx.accountId),
    eq(articles.workspaceId, workspaceId),
    articleIsPublic,
  ) as SQL;

function summaries(db: Db, where: SQL) {
  return db
    .select(summaryColumns())
    .from(articles)
    .leftJoin(articleCategories, eq(articleCategories.id, articles.categoryId))
    .where(where);
}

export async function hasPublicArticles(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
) {
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(scope(ctx, workspaceId))
    .limit(1);
  return !!row;
}

/** Categories that hold at least one public article, with counts. */
async function publicCategories(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
) {
  return db
    .select({
      id: articleCategories.id,
      slug: articleCategories.slug,
      name: articleCategories.name,
      description: articleCategories.description,
      icon: articleCategories.icon,
      articles: count(articles.id),
    })
    .from(articleCategories)
    .innerJoin(
      articles,
      and(
        eq(articles.categoryId, articleCategories.id),
        scope(ctx, workspaceId),
      ),
    )
    .where(
      and(
        eq(articleCategories.accountId, ctx.accountId),
        eq(articleCategories.workspaceId, workspaceId),
      ),
    )
    .groupBy(articleCategories.id)
    .orderBy(byPosition(articleCategories.position));
}

/** The Articles home: featured, recent and categories (doc 15 §6). */
export async function getPublicKnowledgeBase(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
) {
  const [featured, recent, categories] = await Promise.all([
    summaries(
      db,
      and(scope(ctx, workspaceId), eq(articles.featured, true)) as SQL,
    )
      .orderBy(
        sql`${byPosition(articleCategories.position)} nulls last`,
        byPosition(articles.position),
      )
      .limit(6),
    summaries(db, scope(ctx, workspaceId))
      .orderBy(desc(articles.publishedAt))
      .limit(6),
    publicCategories(db, ctx, workspaceId),
  ]);
  return {
    featured: featured.map(toSummary),
    recent: recent.map(toSummary),
    categories,
  };
}

/** A category page: its public articles in the team's order. */
export async function getPublicArticleCategory(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  slug: string,
) {
  const categories = await publicCategories(db, ctx, workspaceId);
  const category = categories.find((c) => c.slug === slug);
  if (!category) return null;
  const rows = await summaries(
    db,
    and(scope(ctx, workspaceId), eq(articles.categoryId, category.id)) as SQL,
  ).orderBy(byPosition(articles.position));
  return { category, categories, articles: rows.map(toSummary) };
}

/** One article with its body and a few more from its category. */
export async function getPublicArticle(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  slug: string,
) {
  const [row] = await db
    .select({
      ...summaryColumns(),
      categoryId: articles.categoryId,
      bodyJson: articles.bodyJson,
      likes: articles.likes,
      neutrals: articles.neutrals,
      dislikes: articles.dislikes,
    })
    .from(articles)
    .leftJoin(articleCategories, eq(articleCategories.id, articles.categoryId))
    .where(and(scope(ctx, workspaceId), eq(articles.slug, slug)))
    .limit(1);
  if (!row) return null;
  const related = row.categoryId
    ? await summaries(
        db,
        and(
          scope(ctx, workspaceId),
          eq(articles.categoryId, row.categoryId),
          ne(articles.id, row.id),
        ) as SQL,
      )
        .orderBy(byPosition(articles.position))
        .limit(5)
    : [];
  return {
    ...toSummary(row),
    html: renderRichText(row.bodyJson) || null,
    ratings: { like: row.likes, neutral: row.neutrals, dislike: row.dislikes },
    related: related.map(toSummary),
  };
}

/**
 * Full-text search with prefix matching (doc 25 A6). Whole words go through
 * the stemmed index ("settings" finds "setting"); the words as typed also
 * match as prefixes of unstemmed words ("sett" finds "settings"), which the
 * stemmed index can't do. A title substring counts too.
 */
export async function searchPublicArticles(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  q: string,
) {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  if (!words.length) return [];
  const prefixes = words.map((w) => `${w}:*`).join(" & ");
  const stemmed = sql`plainto_tsquery('english', ${words.join(" ")})`;
  const rows = await summaries(
    db,
    and(
      scope(ctx, workspaceId),
      or(
        sql`${articles.search} @@ ${stemmed}`,
        sql`to_tsvector('simple', ${articles.title} || ' ' || ${articles.bodyText}) @@ to_tsquery('simple', ${prefixes})`,
        ilike(articles.title, likePattern(q)),
      ),
    ) as SQL,
  )
    .orderBy(
      sql`ts_rank(${articles.search}, ${stemmed}) desc`,
      desc(articles.publishedAt),
    )
    .limit(30);
  return rows.map(toSummary);
}

/** Status of /<ws>/articles[/category/<slug> | /<slug>] for the proxy. */
export async function articlePathStatus(
  db: Db,
  ctx: PublicContext,
  ws: string,
  rest: string[],
): Promise<"ok" | "missing"> {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(eq(workspaces.accountId, ctx.accountId), eq(workspaces.slug, ws)),
    )
    .limit(1);
  if (!workspace) return "missing";
  const [first, second, ...more] = rest;
  if (more.length) return "missing";
  if (!first) {
    return (await hasPublicArticles(db, ctx, workspace.id)) ? "ok" : "missing";
  }
  if (first === "category") {
    if (!second) return "missing";
    return (await getPublicArticleCategory(db, ctx, workspace.id, second))
      ? "ok"
      : "missing";
  }
  if (second) return "missing";
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(scope(ctx, workspace.id), eq(articles.slug, first)))
    .limit(1);
  return row ? "ok" : "missing";
}

/** Published public articles for sitemap.xml. */
export async function listArticleSitemapEntries(db: Db, ctx: PublicContext) {
  return db
    .select({
      workspace: workspaces.slug,
      article: articles.slug,
      updatedAt: articles.updatedAt,
      indexable: sql<boolean>`coalesce((${workspaces.settings}->>'indexPublicPages')::boolean, true)`,
    })
    .from(articles)
    .innerJoin(workspaces, eq(workspaces.id, articles.workspaceId))
    .where(and(eq(articles.accountId, ctx.accountId), articleIsPublic));
}

/** An article visitors may rate, or null. */
export async function getRateableArticle(
  db: Db,
  ctx: PublicContext,
  articleId: string,
) {
  const [row] = await db
    .select({ id: articles.id, workspaceId: articles.workspaceId })
    .from(articles)
    .where(
      and(
        eq(articles.accountId, ctx.accountId),
        eq(articles.id, articleId),
        articleIsPublic,
      ),
    )
    .limit(1);
  return row ?? null;
}
