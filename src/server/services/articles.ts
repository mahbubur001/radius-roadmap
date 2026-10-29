import {
  and,
  count,
  eq,
  gte,
  ilike,
  isNull,
  or,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import type { z } from "zod";
import { richTextToPlain } from "@/lib/rich-text";
import {
  type ArticleFilter,
  articleFilterSchema,
  type createArticleSchema,
  type moveArticleSchema,
  type PatchArticleInput,
  patchArticleSchema,
} from "@/lib/schemas/articles";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import { articleCategories, articles, events, user } from "@/server/db/schema";
import { likePattern } from "./cards";
import {
  isUniqueViolation,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { byPosition, keyAfter, keyBetween } from "./positions";
import { inWorkspace } from "./roadmaps";

// Articles (doc 25). Everyone with access to the workspace writes and
// publishes them (like posts); categories are admin-only. Draft / Published
// only (A3). The slug follows the title until the first publish, then stays
// so links keep working (A2).

export async function getArticle(
  db: DbOrTx,
  ctx: WorkspaceContext,
  id: string,
) {
  const [row] = await db
    .select()
    .from(articles)
    .where(and(inWorkspace(articles, ctx), eq(articles.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Article not found.");
  return row;
}

async function articleSlug(
  db: DbOrTx,
  workspaceId: string,
  title: string,
  exceptId?: string,
) {
  // "/articles/category/…" is the category page, so never use that slug.
  const slug = slugify(title) || "article";
  const base = slug === "category" ? "category-article" : slug;
  const rows = await db
    .select({ id: articles.id, slug: articles.slug })
    .from(articles)
    .where(
      and(
        eq(articles.workspaceId, workspaceId),
        ilike(articles.slug, `${base.replace(/[\\%_]/g, "\\$&")}%`),
      ),
    );
  const taken = new Set(
    rows.filter((r) => r.id !== exceptId).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const inCategory = (categoryId: string | null) =>
  categoryId
    ? eq(articles.categoryId, categoryId)
    : isNull(articles.categoryId);

/** The last position in a category, to append after it. */
async function lastPosition(
  db: DbOrTx,
  ctx: WorkspaceContext,
  categoryId: string | null,
) {
  const [row] = await db
    .select({ position: articles.position })
    .from(articles)
    .where(and(inWorkspace(articles, ctx), inCategory(categoryId)))
    .orderBy(sql`${byPosition(articles.position)} desc`)
    .limit(1);
  return row?.position ?? null;
}

async function ownCategory(
  db: DbOrTx,
  ctx: WorkspaceContext,
  categoryId: string,
) {
  const [row] = await db
    .select({ id: articleCategories.id })
    .from(articleCategories)
    .where(
      and(
        inWorkspace(articleCategories, ctx),
        eq(articleCategories.id, categoryId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Category not found.");
}

async function insertArticle(
  db: DbOrTx,
  values: Omit<typeof articles.$inferInsert, "slug">,
) {
  for (let attempt = 0; ; attempt++) {
    const slug = await articleSlug(db, values.workspaceId, values.title);
    try {
      const [row] = await db
        .insert(articles)
        .values({ ...values, slug })
        .returning();
      if (!row) throw new Error("Failed to create the article.");
      return row;
    } catch (error) {
      if (attempt < 2 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}

export async function createArticle(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof createArticleSchema>,
) {
  const categoryId = input.categoryId ?? null;
  if (categoryId) await ownCategory(db, ctx, categoryId);
  return insertArticle(db, {
    accountId: ctx.accountId,
    workspaceId: ctx.workspaceId,
    categoryId,
    title: "Untitled article",
    position: keyAfter(await lastPosition(db, ctx, categoryId)),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
}

/** Autosave: applies only the fields present in the patch. */
export async function patchArticle(
  db: Db,
  ctx: WorkspaceContext,
  input: PatchArticleInput,
) {
  const { id, bodyJson, categoryId, ...rest } = patchArticleSchema.parse(input);
  const current = await getArticle(db, ctx, id);
  const set: Partial<typeof articles.$inferInsert> = {
    ...rest,
    updatedBy: ctx.userId,
    updatedAt: new Date(),
  };
  if (bodyJson !== undefined) {
    set.bodyJson = bodyJson;
    set.bodyText = richTextToPlain(bodyJson);
  }
  if (categoryId !== undefined && categoryId !== current.categoryId) {
    if (categoryId) await ownCategory(db, ctx, categoryId);
    set.categoryId = categoryId;
    set.position = keyAfter(await lastPosition(db, ctx, categoryId));
  }
  const [row] = await db
    .update(articles)
    .set(set)
    .where(and(inWorkspace(articles, ctx), eq(articles.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Article not found.");
  return row;
}

/** Publish. On the first publish the slug follows the final title. */
export async function publishArticle(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const article = await getArticle(db, ctx, id);
  const slug = article.publishedAt
    ? article.slug
    : await articleSlug(db, ctx.workspaceId, article.title, article.id);
  const [row] = await db
    .update(articles)
    .set({
      status: "published",
      publishedAt: article.publishedAt ?? new Date(),
      slug,
      updatedBy: ctx.userId,
    })
    .where(and(inWorkspace(articles, ctx), eq(articles.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Article not found.");
  return row;
}

/** Back to draft. Keeps the slug and first publish date for republishing. */
export async function unpublishArticle(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const [row] = await db
    .update(articles)
    .set({ status: "draft", updatedBy: ctx.userId })
    .where(and(inWorkspace(articles, ctx), eq(articles.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Article not found.");
  return row;
}

export async function deleteArticle(db: Db, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .delete(articles)
    .where(and(inWorkspace(articles, ctx), eq(articles.id, id)))
    .returning({ id: articles.id });
  if (!row) throw new NotFoundError("Article not found.");
}

/** A draft copy right after the original's category list. */
export async function duplicateArticle(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const article = await getArticle(db, ctx, id);
  return insertArticle(db, {
    accountId: ctx.accountId,
    workspaceId: ctx.workspaceId,
    categoryId: article.categoryId,
    title: `${article.title} (copy)`.slice(0, 200),
    excerpt: article.excerpt,
    bodyJson: article.bodyJson,
    bodyText: article.bodyText,
    isPublic: article.isPublic,
    position: keyAfter(await lastPosition(db, ctx, article.categoryId)),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
}

/** Drag within a category. Neighbours from another category are ignored. */
export async function moveArticle(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof moveArticleSchema>,
) {
  const article = await getArticle(db, ctx, input.id);
  const siblings = await db
    .select({ id: articles.id, position: articles.position })
    .from(articles)
    .where(and(inWorkspace(articles, ctx), inCategory(article.categoryId)))
    .orderBy(byPosition(articles.position));
  const pos = (id: string | null) =>
    id ? siblings.find((a) => a.id === id)?.position : null;
  const position = keyBetween(
    pos(input.prevId),
    pos(input.nextId),
    siblings.filter((a) => a.id !== article.id).at(-1)?.position,
  );
  await db
    .update(articles)
    .set({ position })
    .where(and(inWorkspace(articles, ctx), eq(articles.id, article.id)));
  return position;
}

/** The Articles list: one tab, in category order. */
export async function listArticles(
  db: Db,
  ctx: WorkspaceContext,
  filter: ArticleFilter = {},
) {
  const f = articleFilterSchema.parse(filter);
  const where: SQL[] = [inWorkspace(articles, ctx), eq(articles.status, f.tab)];
  if (f.category === "none") where.push(isNull(articles.categoryId));
  else if (f.category) where.push(eq(articles.categoryId, f.category));
  if (f.q) {
    where.push(
      or(
        sql`${articles.search} @@ websearch_to_tsquery('english', ${f.q})`,
        ilike(articles.title, likePattern(f.q)),
      ) as SQL,
    );
  }
  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      status: articles.status,
      isPublic: articles.isPublic,
      featured: articles.featured,
      categoryId: articles.categoryId,
      position: articles.position,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      likes: articles.likes,
      neutrals: articles.neutrals,
      dislikes: articles.dislikes,
      categoryName: articleCategories.name,
      categoryIcon: articleCategories.icon,
    })
    .from(articles)
    .leftJoin(articleCategories, eq(articleCategories.id, articles.categoryId))
    .where(and(...where))
    .orderBy(
      sql`${byPosition(articleCategories.position)} nulls last`,
      byPosition(articles.position),
    )
    .limit(500);
}

export type ArticleRow = Awaited<ReturnType<typeof listArticles>>[number];

/** Articles per tab, for the tab counts. */
export async function articleCounts(db: Db, ctx: WorkspaceContext) {
  const rows = await db
    .select({ status: articles.status, n: count() })
    .from(articles)
    .where(inWorkspace(articles, ctx))
    .groupBy(articles.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<
    Record<"draft" | "published", number>
  >;
}

/** LoopedIn's Articles tiles (doc 16 §5): published, ratings, views in the last `days`. */
export async function articleStats(db: Db, ctx: WorkspaceContext, days = 30) {
  const [[totals], [views]] = await Promise.all([
    db
      .select({
        published: sql<number>`count(*) filter (where ${articles.status} = 'published')::int`,
        likes: sum(articles.likes).mapWith(Number),
        neutrals: sum(articles.neutrals).mapWith(Number),
        dislikes: sum(articles.dislikes).mapWith(Number),
      })
      .from(articles)
      .where(inWorkspace(articles, ctx)),
    db
      .select({ n: count() })
      .from(events)
      .where(
        and(
          eq(events.accountId, ctx.accountId),
          eq(events.workspaceId, ctx.workspaceId),
          eq(events.type, "article_view"),
          gte(events.createdAt, sql`now() - make_interval(days => ${days})`),
        ),
      ),
  ]);
  return {
    published: totals?.published ?? 0,
    likes: totals?.likes ?? 0,
    neutrals: totals?.neutrals ?? 0,
    dislikes: totals?.dislikes ?? 0,
    views: views?.n ?? 0,
  };
}

/** Everything the editor needs. */
export async function getArticleDetail(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const article = await getArticle(db, ctx, id);
  const [editor] = article.updatedBy
    ? await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, article.updatedBy))
        .limit(1)
    : [];
  const { search: _search, ...rest } = article;
  return { ...rest, updatedByName: editor?.name ?? null };
}

export type ArticleDetail = Awaited<ReturnType<typeof getArticleDetail>>;
