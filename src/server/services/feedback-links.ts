import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { pushToRoadmapSchema } from "@/lib/schemas/feedback";
import type { Db } from "@/server/db/client";
import {
  cardFeedbackLinks,
  feedbackItems,
  roadmapCards,
  roadmapColumns,
  roadmaps,
} from "@/server/db/schema";
import { getCard, insertCard, likePattern } from "./cards";
import type { WorkspaceContext } from "./context";
import { getFeedback } from "./feedback";
import { byPosition, keyAfter } from "./positions";
import { getColumn, inWorkspace, listColumns, listRoadmaps } from "./roadmaps";
import { syncFeedbackStatus } from "./status-sync";

// Feedback ↔ roadmap card links (doc 20 §1 "Push to roadmap"). Everyone with
// workspace access can push and link; both sides are checked against ctx.

/** Roadmaps with their columns, for the "Push to roadmap" picker. */
export async function roadmapTargets(db: Db, ctx: WorkspaceContext) {
  const list = await listRoadmaps(db, ctx);
  return Promise.all(
    list.map(async (r) => ({
      id: r.id,
      title: r.internalTitle,
      columns: (await listColumns(db, ctx, r.id)).map((c) => ({
        id: c.id,
        name: c.name,
        isDone: c.isDone,
      })),
    })),
  );
}

/**
 * New card from the feedback (title as given, description and category
 * copied), appended to `columnId`, and linked. The feedback moves to the
 * first `planned` status, or `done` when the column is a done column.
 */
export async function pushToRoadmap(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof pushToRoadmapSchema>,
) {
  const [item, column] = await Promise.all([
    getFeedback(db, ctx, input.feedbackId),
    getColumn(db, ctx, input.columnId),
  ]);
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ position: roadmapCards.position })
      .from(roadmapCards)
      .where(
        and(
          inWorkspace(roadmapCards, ctx),
          eq(roadmapCards.columnId, column.id),
        ),
      )
      .orderBy(sql`${byPosition(roadmapCards.position)} desc`)
      .limit(1);
    const card = await insertCard(tx, {
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      roadmapId: column.roadmapId,
      columnId: column.id,
      title: input.title,
      summaryJson: item.summaryJson,
      summaryText: item.summaryText,
      categoryId: item.categoryId,
      position: keyAfter(last?.position),
      completedAt: column.isDone ? new Date() : null,
      createdBy: ctx.userId,
    });
    await tx.insert(cardFeedbackLinks).values({
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      cardId: card.id,
      feedbackId: item.id,
      createdBy: ctx.userId,
    });
    await syncFeedbackStatus(
      tx,
      ctx,
      [item.id],
      column.isDone ? "completed" : "planned",
    );
    return card;
  });
}

/** Link to an existing card. Linking twice is a no-op. */
export async function linkCard(
  db: Db,
  ctx: WorkspaceContext,
  feedbackId: string,
  cardId: string,
) {
  const [item, card] = await Promise.all([
    getFeedback(db, ctx, feedbackId),
    getCard(db, ctx, cardId),
  ]);
  await db.transaction(async (tx) => {
    await tx
      .insert(cardFeedbackLinks)
      .values({
        accountId: ctx.accountId,
        workspaceId: ctx.workspaceId,
        cardId: card.id,
        feedbackId: item.id,
        createdBy: ctx.userId,
      })
      .onConflictDoNothing();
    await syncFeedbackStatus(
      tx,
      ctx,
      [item.id],
      card.completedAt ? "completed" : "planned",
    );
  });
}

export async function unlinkCard(
  db: Db,
  ctx: WorkspaceContext,
  feedbackId: string,
  cardId: string,
) {
  await db
    .delete(cardFeedbackLinks)
    .where(
      and(
        inWorkspace(cardFeedbackLinks, ctx),
        eq(cardFeedbackLinks.feedbackId, feedbackId),
        eq(cardFeedbackLinks.cardId, cardId),
      ),
    );
}

/** Card drawer "Linked feedback" tab. */
export async function linkedFeedback(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
) {
  return db
    .select({
      id: feedbackItems.id,
      title: feedbackItems.title,
      statusId: feedbackItems.statusId,
      isPublic: feedbackItems.isPublic,
      review: feedbackItems.review,
      votes: sql<number>`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`,
    })
    .from(cardFeedbackLinks)
    .innerJoin(
      feedbackItems,
      eq(feedbackItems.id, cardFeedbackLinks.feedbackId),
    )
    .where(
      and(
        inWorkspace(cardFeedbackLinks, ctx),
        eq(cardFeedbackLinks.cardId, cardId),
      ),
    )
    .orderBy(
      desc(sql`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`),
      asc(feedbackItems.id),
    );
}

/** Feedback drawer: the cards this item is linked to. */
export async function linkedCards(
  db: Db,
  ctx: WorkspaceContext,
  feedbackId: string,
) {
  return db
    .select({
      id: roadmapCards.id,
      title: roadmapCards.title,
      roadmapSlug: roadmaps.slug,
      roadmapTitle: roadmaps.internalTitle,
      columnName: roadmapColumns.name,
      completed: sql<boolean>`${roadmapCards.completedAt} is not null`,
    })
    .from(cardFeedbackLinks)
    .innerJoin(roadmapCards, eq(roadmapCards.id, cardFeedbackLinks.cardId))
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
    .where(
      and(
        inWorkspace(cardFeedbackLinks, ctx),
        eq(cardFeedbackLinks.feedbackId, feedbackId),
      ),
    )
    .orderBy(asc(roadmapCards.title));
}

/** "Add to roadmap card" picker: unarchived cards matching `q`. */
export async function searchCards(db: Db, ctx: WorkspaceContext, q: string) {
  return db
    .select({
      id: roadmapCards.id,
      title: roadmapCards.title,
      roadmapTitle: roadmaps.internalTitle,
      columnName: roadmapColumns.name,
    })
    .from(roadmapCards)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
    .where(
      and(
        inWorkspace(roadmapCards, ctx),
        isNull(roadmapCards.archivedAt),
        q
          ? or(
              ilike(roadmapCards.title, likePattern(q)),
              ilike(roadmapCards.publicTitle, likePattern(q)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(roadmapCards.updatedAt), asc(roadmapCards.id))
    .limit(20);
}
