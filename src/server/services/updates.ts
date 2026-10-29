import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { z } from "zod";
import { richTextToPlain } from "@/lib/rich-text";
import {
  type createUpdateSchema,
  type PatchUpdateInput,
  patchUpdateSchema,
  type UpdateFilter,
  updateFilterSchema,
} from "@/lib/schemas/updates";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  roadmapCards,
  roadmaps,
  updateCards,
  updateCategories,
  updates,
  user,
} from "@/server/db/schema";
import { deleteFile, prefixes } from "@/server/storage";
import { keyHasPrefix } from "@/server/storage/keys";
import { likePattern } from "./cards";
import {
  ForbiddenError,
  isUniqueViolation,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { inWorkspace } from "./roadmaps";

// Update posts (doc 23 step 2). Everyone with access to the workspace can
// write and edit posts (like cards); publishing comes in step 3.

export async function getUpdate(db: DbOrTx, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select()
    .from(updates)
    .where(and(inWorkspace(updates, ctx), eq(updates.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Post not found.");
  return row;
}

async function uniqueSlug(db: DbOrTx, workspaceId: string, title: string) {
  const base = slugify(title) || "post";
  const rows = await db
    .select({ slug: updates.slug })
    .from(updates)
    .where(
      and(
        eq(updates.workspaceId, workspaceId),
        ilike(updates.slug, `${base.replace(/[\\%_]/g, "\\$&")}%`),
      ),
    );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function insertUpdate(
  db: DbOrTx,
  values: Omit<typeof updates.$inferInsert, "slug">,
) {
  for (let attempt = 0; ; attempt++) {
    const slug = await uniqueSlug(db, values.workspaceId, values.title);
    try {
      const [row] = await db
        .insert(updates)
        .values({ ...values, slug })
        .returning();
      if (!row) throw new Error("Failed to create the post.");
      return row;
    } catch (error) {
      if (attempt < 2 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}

/** A new draft; from a card, it starts with the card's title and summary. */
export async function createUpdate(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof createUpdateSchema>,
) {
  const card = input.cardId
    ? (
        await db
          .select({
            id: roadmapCards.id,
            title: sql<string>`coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title})`,
            summaryJson: roadmapCards.summaryJson,
            summaryText: roadmapCards.summaryText,
          })
          .from(roadmapCards)
          .where(
            and(
              inWorkspace(roadmapCards, ctx),
              eq(roadmapCards.id, input.cardId),
            ),
          )
          .limit(1)
      )[0]
    : undefined;
  if (input.cardId && !card) throw new NotFoundError("Card not found.");

  return db.transaction(async (tx) => {
    const row = await insertUpdate(tx, {
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      title: card?.title ?? "Untitled post",
      bodyJson: card?.summaryJson ?? null,
      bodyText: card?.summaryText ?? "",
      createdBy: ctx.userId,
    });
    if (card) {
      await tx
        .insert(updateCards)
        .values({ updateId: row.id, cardId: card.id });
    }
    return row;
  });
}

/** Autosave: applies only the fields present in the patch. */
export async function patchUpdate(
  db: Db,
  ctx: WorkspaceContext,
  input: PatchUpdateInput,
) {
  const { id, bodyJson, categoryId, cover, ...rest } =
    patchUpdateSchema.parse(input);
  const current = await getUpdate(db, ctx, id);
  const set: Partial<typeof updates.$inferInsert> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (bodyJson !== undefined) {
    set.bodyJson = bodyJson;
    set.bodyText = richTextToPlain(bodyJson);
  }
  if (categoryId !== undefined) {
    if (categoryId) {
      const [own] = await db
        .select({ id: updateCategories.id })
        .from(updateCategories)
        .where(
          and(
            inWorkspace(updateCategories, ctx),
            eq(updateCategories.id, categoryId),
          ),
        )
        .limit(1);
      if (!own) throw new NotFoundError("Category not found.");
    }
    set.categoryId = categoryId;
  }
  if (cover !== undefined) {
    // Covers are uploaded like images in descriptions (tenant prefix).
    if (
      cover &&
      !keyHasPrefix(cover, prefixes.cardImages(ctx.accountId, ctx.workspaceId))
    ) {
      throw new ForbiddenError();
    }
    set.cover = cover;
  }
  const [row] = await db
    .update(updates)
    .set(set)
    .where(and(inWorkspace(updates, ctx), eq(updates.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Post not found.");
  if (cover !== undefined && current.cover && current.cover !== cover) {
    await deleteFile(current.cover);
  }
  return row;
}

/** The cards a post announces; only this workspace's cards are kept. */
export async function setUpdateCards(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
  cardIds: string[],
) {
  await getUpdate(db, ctx, id);
  const valid = cardIds.length
    ? await db
        .select({ id: roadmapCards.id })
        .from(roadmapCards)
        .where(
          and(
            inWorkspace(roadmapCards, ctx),
            inArray(roadmapCards.id, cardIds),
          ),
        )
    : [];
  await db.transaction(async (tx) => {
    await tx.delete(updateCards).where(eq(updateCards.updateId, id));
    if (valid.length) {
      await tx
        .insert(updateCards)
        .values(valid.map((c) => ({ updateId: id, cardId: c.id })));
    }
  });
  return valid.map((c) => c.id);
}

export async function deleteUpdate(db: Db, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .delete(updates)
    .where(and(inWorkspace(updates, ctx), eq(updates.id, id)))
    .returning({ cover: updates.cover });
  if (!row) throw new NotFoundError("Post not found.");
  if (row.cover) await deleteFile(row.cover);
}

/** A draft copy (content, category, cards; never the publish state). */
export async function duplicateUpdate(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const post = await getUpdate(db, ctx, id);
  return db.transaction(async (tx) => {
    const copy = await insertUpdate(tx, {
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      title: `${post.title} (copy)`.slice(0, 200),
      bodyJson: post.bodyJson,
      bodyText: post.bodyText,
      categoryId: post.categoryId,
      isPublic: post.isPublic,
      emailSubscribers: post.emailSubscribers,
      createdBy: ctx.userId,
    });
    await tx.execute(sql`
      insert into ${updateCards} (update_id, card_id)
      select ${copy.id}, card_id from ${updateCards} where update_id = ${post.id}`);
    return copy;
  });
}

/** The Updates list: one tab, newest first (pinned first when published). */
export async function listUpdates(
  db: Db,
  ctx: WorkspaceContext,
  filter: UpdateFilter = {},
) {
  const f = updateFilterSchema.parse(filter);
  const where: SQL[] = [inWorkspace(updates, ctx), eq(updates.status, f.tab)];
  if (f.categoryId) where.push(eq(updates.categoryId, f.categoryId));
  if (f.q) {
    where.push(
      or(
        sql`${updates.search} @@ websearch_to_tsquery('english', ${f.q})`,
        ilike(updates.title, likePattern(f.q)),
      ) as SQL,
    );
  }
  const order =
    f.tab === "published"
      ? [desc(updates.pinned), desc(updates.publishedAt)]
      : f.tab === "scheduled"
        ? [sql`${updates.publishAt} asc`]
        : [desc(updates.updatedAt)];
  const rows = await db
    .select({
      id: updates.id,
      slug: updates.slug,
      title: updates.title,
      status: updates.status,
      isPublic: updates.isPublic,
      pinned: updates.pinned,
      publishAt: updates.publishAt,
      publishedAt: updates.publishedAt,
      updatedAt: updates.updatedAt,
      categoryName: updateCategories.name,
      categoryColor: updateCategories.color,
      cards: sql<number>`(select count(*)::int from ${updateCards} where ${updateCards.updateId} = ${updates.id})`,
    })
    .from(updates)
    .leftJoin(updateCategories, eq(updateCategories.id, updates.categoryId))
    .where(and(...where))
    .orderBy(...order)
    .limit(200);
  return rows.map((r) => ({
    ...r,
    category:
      r.categoryName && r.categoryColor
        ? { name: r.categoryName, color: r.categoryColor }
        : null,
  }));
}

export type UpdateRow = Awaited<ReturnType<typeof listUpdates>>[number];

/** Posts per tab, for the tab counts. */
export async function updateCounts(db: Db, ctx: WorkspaceContext) {
  const rows = await db
    .select({ status: updates.status, n: count() })
    .from(updates)
    .where(inWorkspace(updates, ctx))
    .groupBy(updates.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<
    Record<"draft" | "scheduled" | "published", number>
  >;
}

/** Everything the editor needs. */
export async function getUpdateDetail(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const post = await getUpdate(db, ctx, id);
  const [cards, [author]] = await Promise.all([
    db
      .select({
        id: roadmapCards.id,
        title: roadmapCards.title,
        completed: sql<boolean>`${roadmapCards.completedAt} is not null`,
        roadmap: roadmaps.slug,
      })
      .from(updateCards)
      .innerJoin(roadmapCards, eq(roadmapCards.id, updateCards.cardId))
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
      .where(eq(updateCards.updateId, id)),
    post.createdBy
      ? db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, post.createdBy))
          .limit(1)
      : [],
  ]);
  const { search: _search, ...rest } = post;
  return { ...rest, cards, authorName: author?.name ?? null };
}

/** Card picker: completed cards first, then the rest, matching `q`. */
export async function searchCardsForUpdate(
  db: Db,
  ctx: WorkspaceContext,
  q: string,
) {
  return db
    .select({
      id: roadmapCards.id,
      title: roadmapCards.title,
      completed: sql<boolean>`${roadmapCards.completedAt} is not null`,
    })
    .from(roadmapCards)
    .where(
      and(
        inWorkspace(roadmapCards, ctx),
        sql`${roadmapCards.archivedAt} is null`,
        q ? ilike(roadmapCards.title, likePattern(q)) : undefined,
      ),
    )
    .orderBy(
      sql`${roadmapCards.completedAt} desc nulls last`,
      desc(roadmapCards.updatedAt),
    )
    .limit(20);
}
