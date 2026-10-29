import { and, count, eq, ilike, sql } from "drizzle-orm";
import type { z } from "zod";
import type {
  articleCategorySchema,
  editArticleCategorySchema,
  moveArticleCategorySchema,
} from "@/lib/schemas/articles";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import { articleCategories, articles } from "@/server/db/schema";
import {
  assertRole,
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { byPosition, keyAfter, keyBetween } from "./positions";
import { inWorkspace } from "./roadmaps";

// Article categories (doc 25 A5): name, description and an emoji icon,
// ordered, per workspace. Empty by default; admins manage them.

async function categorySlug(
  db: DbOrTx,
  workspaceId: string,
  name: string,
  exceptId?: string,
) {
  const base = slugify(name) || "category";
  const rows = await db
    .select({ id: articleCategories.id, slug: articleCategories.slug })
    .from(articleCategories)
    .where(
      and(
        eq(articleCategories.workspaceId, workspaceId),
        ilike(articleCategories.slug, `${base.replace(/[\\%_]/g, "\\$&")}%`),
      ),
    );
  const taken = new Set(
    rows.filter((r) => r.id !== exceptId).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Categories in order, with how many articles each holds (all statuses). */
export async function listArticleCategories(db: DbOrTx, ctx: WorkspaceContext) {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(articleCategories)
      .where(inWorkspace(articleCategories, ctx))
      .orderBy(byPosition(articleCategories.position)),
    db
      .select({ categoryId: articles.categoryId, n: count() })
      .from(articles)
      .where(inWorkspace(articles, ctx))
      .groupBy(articles.categoryId),
  ]);
  return rows.map((c) => ({
    ...c,
    articles: counts.find((x) => x.categoryId === c.id)?.n ?? 0,
  }));
}

export type ArticleCategoryRow = Awaited<
  ReturnType<typeof listArticleCategories>
>[number];

function conflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictError("That category already exists.");
  }
  throw error;
}

export async function createArticleCategory(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof articleCategorySchema>,
) {
  assertRole(ctx, "admin");
  const [last] = await db
    .select({ position: articleCategories.position })
    .from(articleCategories)
    .where(inWorkspace(articleCategories, ctx))
    .orderBy(sql`${byPosition(articleCategories.position)} desc`)
    .limit(1);
  try {
    const [row] = await db
      .insert(articleCategories)
      .values({
        accountId: ctx.accountId,
        workspaceId: ctx.workspaceId,
        slug: await categorySlug(db, ctx.workspaceId, input.name),
        name: input.name,
        description: input.description,
        icon: input.icon,
        position: keyAfter(last?.position),
      })
      .returning();
    if (!row) throw new Error("Failed to create the category.");
    return row;
  } catch (error) {
    conflict(error);
  }
}

/** Renaming changes the slug too (category pages aren't linked from email). */
export async function updateArticleCategory(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof editArticleCategorySchema>,
) {
  assertRole(ctx, "admin");
  const { id, ...data } = input;
  try {
    const [row] = await db
      .update(articleCategories)
      .set({
        ...data,
        slug: await categorySlug(db, ctx.workspaceId, data.name, id),
      })
      .where(
        and(inWorkspace(articleCategories, ctx), eq(articleCategories.id, id)),
      )
      .returning();
    if (!row) throw new NotFoundError("Category not found.");
    return row;
  } catch (error) {
    conflict(error);
  }
}

export async function moveArticleCategory(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof moveArticleCategorySchema>,
) {
  assertRole(ctx, "admin");
  const siblings = await db
    .select({ id: articleCategories.id, position: articleCategories.position })
    .from(articleCategories)
    .where(inWorkspace(articleCategories, ctx))
    .orderBy(byPosition(articleCategories.position));
  if (!siblings.some((c) => c.id === input.id)) {
    throw new NotFoundError("Category not found.");
  }
  const pos = (id: string | null) =>
    id ? siblings.find((c) => c.id === id)?.position : null;
  const position = keyBetween(
    pos(input.prevId),
    pos(input.nextId),
    siblings.filter((c) => c.id !== input.id).at(-1)?.position,
  );
  await db
    .update(articleCategories)
    .set({ position })
    .where(
      and(
        inWorkspace(articleCategories, ctx),
        eq(articleCategories.id, input.id),
      ),
    );
  return position;
}

/** Its articles stay, uncategorised (FK set null). */
export async function deleteArticleCategory(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  assertRole(ctx, "admin");
  const [row] = await db
    .delete(articleCategories)
    .where(
      and(inWorkspace(articleCategories, ctx), eq(articleCategories.id, id)),
    )
    .returning({ id: articleCategories.id });
  if (!row) throw new NotFoundError("Category not found.");
}
