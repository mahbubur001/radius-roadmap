import {
  and,
  count,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { z } from "zod";
import { richTextToPlain } from "@/lib/rich-text";
import {
  type BoardFilter,
  boardFilterSchema,
  type createCardSchema,
  type createFeatureSchema,
  type moveCardSchema,
  type transferCardSchema,
  type UpdateCardInput,
  updateCardSchema,
  type updateFeatureSchema,
} from "@/lib/schemas/roadmap";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  cardFeatures,
  cardFeedbackLinks,
  cardTags,
  categories,
  type RoadmapCard,
  roadmapCards,
  user,
} from "@/server/db/schema";
import {
  isUniqueViolation,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { byPosition, keyAfter, keyBetween } from "./positions";
import { getColumn, getRoadmap, inWorkspace, ownTagIds } from "./roadmaps";
import { syncCardFeedback } from "./status-sync";

// Cards can be created, edited and moved by everyone with access to the
// workspace (Phase 1 rules). Every query is scoped by account + workspace.

/** Escape LIKE wildcards in user input. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function getCard(db: DbOrTx, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select()
    .from(roadmapCards)
    .where(and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Card not found.");
  return row;
}

async function columnCards(
  db: DbOrTx,
  ctx: WorkspaceContext,
  columnId: string,
) {
  return db
    .select({ id: roadmapCards.id, position: roadmapCards.position })
    .from(roadmapCards)
    .where(
      and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.columnId, columnId)),
    )
    .orderBy(byPosition(roadmapCards.position));
}

async function uniqueCardSlug(db: DbOrTx, workspaceId: string, title: string) {
  const base = slugify(title) || "card";
  const rows = await db
    .select({ slug: roadmapCards.slug })
    .from(roadmapCards)
    .where(
      and(
        eq(roadmapCards.workspaceId, workspaceId),
        ilike(roadmapCards.slug, `${base.replace(/[\\%_]/g, "\\$&")}%`),
      ),
    );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Insert a card (no checks) with a free slug, retrying once on a race. */
export async function insertCard(
  db: DbOrTx,
  values: Omit<typeof roadmapCards.$inferInsert, "slug"> & { slug?: string },
): Promise<RoadmapCard> {
  for (let attempt = 0; ; attempt++) {
    const slug =
      attempt === 0 && values.slug
        ? values.slug
        : await uniqueCardSlug(
            db,
            values.workspaceId,
            values.publicTitle ?? values.title,
          );
    try {
      const [row] = await db
        .insert(roadmapCards)
        .values({ ...values, slug })
        .returning();
      if (!row) throw new Error("Failed to create card.");
      return row;
    } catch (error) {
      if (attempt < 2 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}

export async function createCard(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof createCardSchema>,
) {
  const column = await getColumn(db, ctx, input.columnId);
  if (column.roadmapId !== input.roadmapId) {
    throw new NotFoundError("Column not found.");
  }
  const existing = await columnCards(db, ctx, column.id);
  return insertCard(db, {
    accountId: ctx.accountId,
    workspaceId: ctx.workspaceId,
    roadmapId: column.roadmapId,
    columnId: column.id,
    title: input.title,
    position: keyAfter(existing.at(-1)?.position),
    completedAt: column.isDone ? new Date() : null,
    createdBy: ctx.userId,
  });
}

/** Autosave: applies only the fields present in the patch. */
export async function updateCard(
  db: Db,
  ctx: WorkspaceContext,
  input: UpdateCardInput,
) {
  const { id, tagIds, summaryJson, categoryId, ...rest } =
    updateCardSchema.parse(input);
  await getCard(db, ctx, id);

  // updatedAt is always set, so a tags-only patch still has a SET clause.
  const set: Partial<typeof roadmapCards.$inferInsert> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (summaryJson !== undefined) {
    set.summaryJson = summaryJson;
    set.summaryText = richTextToPlain(summaryJson);
  }
  if (categoryId !== undefined) {
    if (categoryId) {
      const [own] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(inWorkspace(categories, ctx), eq(categories.id, categoryId)))
        .limit(1);
      if (!own) throw new NotFoundError("Category not found.");
    }
    set.categoryId = categoryId;
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(roadmapCards)
      .set(set)
      .where(and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Card not found.");
    if (tagIds !== undefined) {
      const valid = await ownTagIds(tx, ctx, tagIds);
      await tx.delete(cardTags).where(eq(cardTags.cardId, id));
      if (valid.length) {
        await tx
          .insert(cardTags)
          .values(valid.map((tagId) => ({ cardId: id, tagId })));
      }
    }
    return row;
  });
}

/**
 * Move a card to `columnId`, between two neighbours in that column. Crossing
 * into or out of a "done" column sets or clears completedAt.
 */
export async function moveCard(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof moveCardSchema>,
) {
  const card = await getCard(db, ctx, input.id);
  const [from, to] = await Promise.all([
    getColumn(db, ctx, card.columnId),
    getColumn(db, ctx, input.columnId),
  ]);
  if (to.roadmapId !== card.roadmapId) {
    throw new NotFoundError("Column not found.");
  }
  const siblings = (await columnCards(db, ctx, to.id)).filter(
    (c) => c.id !== card.id,
  );
  const pos = (id: string | null) =>
    id ? siblings.find((c) => c.id === id)?.position : null;
  const position = keyBetween(
    pos(input.prevId),
    pos(input.nextId),
    siblings.at(-1)?.position,
  );

  let completedAt = card.completedAt;
  if (to.isDone && !from.isDone) completedAt ??= new Date();
  if (!to.isDone && from.isDone) completedAt = null;

  const [row] = await db
    .update(roadmapCards)
    .set({ columnId: to.id, position, completedAt })
    .where(and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.id, card.id)))
    .returning();
  // Linked feedback follows the card into or out of done (doc 20 D5).
  if (to.isDone !== from.isDone) {
    await syncCardFeedback(
      db,
      ctx,
      card.id,
      to.isDone ? "completed" : "reopened",
    );
  }
  return row;
}

export async function setCardCompleted(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
  completed: boolean,
) {
  const [row] = await db
    .update(roadmapCards)
    .set({ completedAt: completed ? new Date() : null })
    .where(and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Card not found.");
  await syncCardFeedback(db, ctx, id, completed ? "completed" : "reopened");
  return row;
}

export async function setCardArchived(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
  archived: boolean,
) {
  const [row] = await db
    .update(roadmapCards)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Card not found.");
  return row;
}

export async function deleteCard(db: Db, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .delete(roadmapCards)
    .where(and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.id, id)))
    .returning({ id: roadmapCards.id });
  if (!row) throw new NotFoundError("Card not found.");
}

/**
 * Copies a card's content, objective, tags and features (not votes, links or
 * history) to the end of `column`.
 */
async function copyCard(
  db: Db,
  ctx: WorkspaceContext,
  card: RoadmapCard,
  column: Awaited<ReturnType<typeof getColumn>>,
  title: string,
) {
  const existing = await columnCards(db, ctx, column.id);
  return db.transaction(async (tx) => {
    const copy = await insertCard(tx, {
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      roadmapId: column.roadmapId,
      columnId: column.id,
      title,
      publicTitle: card.publicTitle,
      summaryJson: card.summaryJson,
      summaryText: card.summaryText,
      categoryId: card.categoryId,
      plannedFor: card.plannedFor,
      isPublic: card.isPublic,
      position: keyAfter(existing.at(-1)?.position),
      completedAt: column.isDone ? new Date() : null,
      createdBy: ctx.userId,
    });
    await tx.execute(sql`
      insert into ${cardTags} (card_id, tag_id)
      select ${copy.id}, tag_id from ${cardTags} where card_id = ${card.id}`);
    await tx.execute(sql`
      insert into ${cardFeatures} (account_id, card_id, title, done, position)
      select account_id, ${copy.id}, title, done, position
      from ${cardFeatures} where card_id = ${card.id}`);
    return copy;
  });
}

/** "Duplicate card": a copy at the end of the same column. */
export async function duplicateCard(db: Db, ctx: WorkspaceContext, id: string) {
  const card = await getCard(db, ctx, id);
  const column = await getColumn(db, ctx, card.columnId);
  return copyCard(db, ctx, card, column, `${card.title} (copy)`.slice(0, 200));
}

/**
 * "Move to…" / "Copy to…": to the end of a column on any roadmap of this
 * workspace. A move keeps votes, links and history; crossing into or out of a
 * done column completes or reopens the card (and its linked feedback).
 */
export async function transferCard(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof transferCardSchema>,
) {
  const card = await getCard(db, ctx, input.id);
  const [from, to] = await Promise.all([
    getColumn(db, ctx, card.columnId),
    getColumn(db, ctx, input.columnId),
  ]);
  if (input.mode === "copy") return copyCard(db, ctx, card, to, card.title);
  if (to.id === from.id) return card;

  const existing = await columnCards(db, ctx, to.id);
  let completedAt = card.completedAt;
  if (to.isDone && !from.isDone) completedAt ??= new Date();
  if (!to.isDone && from.isDone) completedAt = null;
  const [row] = await db
    .update(roadmapCards)
    .set({
      roadmapId: to.roadmapId,
      columnId: to.id,
      position: keyAfter(existing.at(-1)?.position),
      completedAt,
    })
    .where(and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.id, card.id)))
    .returning();
  if (!row) throw new NotFoundError("Card not found.");
  if (to.isDone !== from.isDone) {
    await syncCardFeedback(
      db,
      ctx,
      card.id,
      to.isDone ? "completed" : "reopened",
    );
  }
  return row;
}

// ── Board ───────────────────────────────────────────────────────────────

export type BoardCard = {
  id: string;
  slug: string;
  columnId: string;
  position: string;
  title: string;
  publicTitle: string | null;
  summaryText: string;
  categoryId: string | null;
  plannedFor: string | null;
  isPublic: boolean;
  completed: boolean;
  votes: number;
  tagIds: string[];
  features: { done: number; total: number };
  /** Feedback linked to the card (the 💡 count on the board). */
  ideas: number;
};

/** Cards for the admin board (archived cards excluded), in column order. */
export async function listBoardCards(
  db: Db,
  ctx: WorkspaceContext,
  roadmapId: string,
  filter: BoardFilter = {},
): Promise<BoardCard[]> {
  await getRoadmap(db, ctx, roadmapId);
  const f = boardFilterSchema.parse(filter);

  const where = [
    inWorkspace(roadmapCards, ctx),
    eq(roadmapCards.roadmapId, roadmapId),
    isNull(roadmapCards.archivedAt),
  ];
  if (f.q) {
    where.push(
      or(
        sql`${roadmapCards.search} @@ websearch_to_tsquery('english', ${f.q})`,
        ilike(roadmapCards.title, likePattern(f.q)),
        ilike(roadmapCards.publicTitle, likePattern(f.q)),
      ) as ReturnType<typeof eq>,
    );
  }
  if (f.categoryId) where.push(eq(roadmapCards.categoryId, f.categoryId));
  if (f.tagId) {
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(cardTags)
          .where(
            and(
              eq(cardTags.cardId, roadmapCards.id),
              eq(cardTags.tagId, f.tagId),
            ),
          ),
      ),
    );
  }
  if (f.visibility !== "all") {
    where.push(eq(roadmapCards.isPublic, f.visibility === "public"));
  }
  if (!f.showCompleted) where.push(isNull(roadmapCards.completedAt));

  const rows = await db
    .select({
      id: roadmapCards.id,
      slug: roadmapCards.slug,
      columnId: roadmapCards.columnId,
      position: roadmapCards.position,
      title: roadmapCards.title,
      publicTitle: roadmapCards.publicTitle,
      summaryText: roadmapCards.summaryText,
      categoryId: roadmapCards.categoryId,
      plannedFor: roadmapCards.plannedFor,
      isPublic: roadmapCards.isPublic,
      completedAt: roadmapCards.completedAt,
      voteCount: roadmapCards.voteCount,
      importedVotes: roadmapCards.importedVotes,
      ideas: sql<number>`(select count(*)::int from ${cardFeedbackLinks} where ${cardFeedbackLinks.cardId} = ${roadmapCards.id})`,
    })
    .from(roadmapCards)
    .where(and(...where))
    .orderBy(byPosition(roadmapCards.position));

  const ids = rows.map((r) => r.id);
  const [tagRows, featureRows] = ids.length
    ? await Promise.all([
        db.select().from(cardTags).where(inArray(cardTags.cardId, ids)),
        db
          .select({
            cardId: cardFeatures.cardId,
            total: count(),
            done: sql<number>`count(*) filter (where ${cardFeatures.done})::int`,
          })
          .from(cardFeatures)
          .where(inArray(cardFeatures.cardId, ids))
          .groupBy(cardFeatures.cardId),
      ])
    : [[], []];

  return rows.map(({ completedAt, voteCount, importedVotes, ...r }) => {
    const f = featureRows.find((x) => x.cardId === r.id);
    return {
      ...r,
      summaryText: r.summaryText.slice(0, 200),
      completed: !!completedAt,
      votes: voteCount + importedVotes,
      tagIds: tagRows.filter((t) => t.cardId === r.id).map((t) => t.tagId),
      features: { done: f?.done ?? 0, total: f?.total ?? 0 },
    };
  });
}

/** Everything the card drawer needs. */
export async function getCardDetail(db: Db, ctx: WorkspaceContext, id: string) {
  const card = await getCard(db, ctx, id);
  const [tagRows, features, [creator]] = await Promise.all([
    db
      .select({ tagId: cardTags.tagId })
      .from(cardTags)
      .where(eq(cardTags.cardId, id)),
    listFeatures(db, ctx, id),
    card.createdBy
      ? db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, card.createdBy))
          .limit(1)
      : [],
  ]);
  const { search: _search, ...rest } = card;
  return {
    ...rest,
    tagIds: tagRows.map((t) => t.tagId),
    features,
    createdByName: creator?.name ?? null,
  };
}

// ── Features ────────────────────────────────────────────────────────────

export async function listFeatures(
  db: DbOrTx,
  ctx: WorkspaceContext,
  cardId: string,
) {
  return db
    .select({
      id: cardFeatures.id,
      title: cardFeatures.title,
      done: cardFeatures.done,
      position: cardFeatures.position,
    })
    .from(cardFeatures)
    .where(
      and(
        eq(cardFeatures.accountId, ctx.accountId),
        eq(cardFeatures.cardId, cardId),
      ),
    )
    .orderBy(byPosition(cardFeatures.position));
}

export async function addFeature(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof createFeatureSchema>,
) {
  await getCard(db, ctx, input.cardId);
  const existing = await listFeatures(db, ctx, input.cardId);
  const [row] = await db
    .insert(cardFeatures)
    .values({
      accountId: ctx.accountId,
      cardId: input.cardId,
      title: input.title,
      position: keyAfter(existing.at(-1)?.position),
    })
    .returning();
  return row;
}

/** A feature by id, only if its card is in this workspace. */
async function ownFeature(db: Db, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select({ id: cardFeatures.id })
    .from(cardFeatures)
    .innerJoin(roadmapCards, eq(roadmapCards.id, cardFeatures.cardId))
    .where(and(inWorkspace(roadmapCards, ctx), eq(cardFeatures.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Feature not found.");
}

export async function updateFeature(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof updateFeatureSchema>,
) {
  const { id, ...set } = input;
  await ownFeature(db, ctx, id);
  if (!Object.keys(set).length) return;
  await db.update(cardFeatures).set(set).where(eq(cardFeatures.id, id));
}

export async function deleteFeature(db: Db, ctx: WorkspaceContext, id: string) {
  await ownFeature(db, ctx, id);
  await db.delete(cardFeatures).where(eq(cardFeatures.id, id));
}
