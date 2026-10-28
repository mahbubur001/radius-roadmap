import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  cardFeedbackLinks,
  type FeedbackStatusKind,
  feedbackItems,
  feedbackStatuses,
} from "@/server/db/schema";
import type { WorkspaceContext } from "./context";
import { byPosition } from "./positions";
import { inWorkspace } from "./roadmaps";

// Card → feedback status sync (doc 20 D5). One way and automatic: what
// happens to a linked roadmap card moves its feedback along. Kept free of
// other service imports so cards.ts can call it without an import cycle.

async function firstOfKind(
  db: DbOrTx,
  ctx: WorkspaceContext,
  kind: FeedbackStatusKind,
) {
  const [row] = await db
    .select({ id: feedbackStatuses.id })
    .from(feedbackStatuses)
    .where(
      and(inWorkspace(feedbackStatuses, ctx), eq(feedbackStatuses.kind, kind)),
    )
    .orderBy(byPosition(feedbackStatuses.position))
    .limit(1);
  return row?.id ?? null;
}

export type SyncEvent = "planned" | "completed" | "reopened";

const target: Record<SyncEvent, FeedbackStatusKind> = {
  planned: "planned",
  completed: "done",
  reopened: "in_progress",
};

/**
 * Moves feedback to the first status of the event's kind:
 * - planned (pushed to / linked with a card): only items still `open`, so a
 *   manual "In progress" isn't pushed back;
 * - completed (card entered a done column / marked complete): `done`;
 * - reopened (card left done): `in_progress`, only items that were `done`.
 * Workspaces without a status of that kind are left alone.
 */
export async function syncFeedbackStatus(
  db: DbOrTx,
  ctx: WorkspaceContext,
  feedbackIds: string[],
  event: SyncEvent,
) {
  if (!feedbackIds.length) return;
  const statusId = await firstOfKind(db, ctx, target[event]);
  if (!statusId) return;
  const onlyFrom: FeedbackStatusKind | null =
    event === "planned" ? "open" : event === "reopened" ? "done" : null;
  await db
    .update(feedbackItems)
    .set({
      statusId,
      completedAt: event === "completed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inWorkspace(feedbackItems, ctx),
        inArray(feedbackItems.id, feedbackIds),
        onlyFrom
          ? sql`${feedbackItems.statusId} in (select ${feedbackStatuses.id} from ${feedbackStatuses} where ${feedbackStatuses.kind} = ${onlyFrom})`
          : undefined,
      ),
    );
}

/** Feedback linked to a card, then synced (called from cards.ts). */
export async function syncCardFeedback(
  db: DbOrTx,
  ctx: WorkspaceContext,
  cardId: string,
  event: SyncEvent,
) {
  const links = await db
    .select({ feedbackId: cardFeedbackLinks.feedbackId })
    .from(cardFeedbackLinks)
    .where(
      and(
        inWorkspace(cardFeedbackLinks, ctx),
        eq(cardFeedbackLinks.cardId, cardId),
      ),
    );
  await syncFeedbackStatus(
    db,
    ctx,
    links.map((l) => l.feedbackId),
    event,
  );
}
