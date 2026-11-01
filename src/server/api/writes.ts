import "server-only";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { plainToRichText } from "@/lib/rich-text";
import type { Db } from "@/server/db/client";
import {
  feedbackBoards,
  feedbackItems,
  roadmapCards,
  roadmaps,
  updates,
} from "@/server/db/schema";
import { invalidatePublic, invalidateSite } from "@/server/public-cache";
import {
  notify,
  queueStatusSweep,
  schedulePublish,
} from "@/server/queue/notifications";
import {
  createCard,
  deleteCard,
  getCard,
  moveCard,
  setCardCompleted,
  updateCard,
} from "@/server/services/cards";
import {
  type AccountContext,
  NotFoundError,
  type WorkspaceContext,
} from "@/server/services/context";
import {
  createFeedback,
  deleteFeedback,
  setFeedbackArchived,
  setFeedbackCompleted,
  updateFeedback,
} from "@/server/services/feedback";
import {
  createUpdate,
  deleteUpdate,
  patchUpdate,
  publishUpdate,
  unpublishUpdate,
} from "@/server/services/updates";
import { getWorkspaceById } from "@/server/services/workspaces";
import type {
  createCardBody,
  createFeedbackBody,
  createUpdateBody,
  updateCardBody,
  updateFeedbackBody,
  updateUpdateBody,
} from "./write-schemas";

// API writes (doc 27 step 3): the same services and side effects as the
// dashboard actions (public cache, follower sweeps, post emails).

async function inWorkspace(
  db: Db,
  ctx: AccountContext,
  workspaceId: string,
): Promise<WorkspaceContext> {
  const ws = await getWorkspaceById(db, ctx, workspaceId);
  return { ...ctx, workspaceId: ws.id, workspaceSlug: ws.slug };
}

/** The workspace an item of the account lives in, or 404. */
async function workspaceOf(
  db: Db,
  ctx: AccountContext,
  table: typeof roadmapCards | typeof feedbackItems | typeof updates,
  id: string,
  what: string,
) {
  const [row] = await db
    .select({ workspaceId: table.workspaceId })
    .from(table)
    .where(and(eq(table.accountId, ctx.accountId), eq(table.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError(`${what} not found.`);
  return inWorkspace(db, ctx, row.workspaceId);
}

async function afterChange(ctx: WorkspaceContext, sweep = true) {
  invalidatePublic(ctx.workspaceId);
  invalidateSite(ctx.accountId);
  if (sweep) await queueStatusSweep(ctx.workspaceId);
}

const rich = (text: string | undefined) =>
  text === undefined ? undefined : text ? plainToRichText(text) : null;

// ── Roadmap cards ───────────────────────────────────────────────────────

export async function apiCreateCard(
  db: Db,
  ctx: AccountContext,
  body: z.output<typeof createCardBody>,
) {
  const [roadmap] = await db
    .select({ workspaceId: roadmaps.workspaceId })
    .from(roadmaps)
    .where(
      and(
        eq(roadmaps.accountId, ctx.accountId),
        eq(roadmaps.id, body.roadmap_id),
      ),
    )
    .limit(1);
  if (!roadmap) throw new NotFoundError("Roadmap not found.");
  const ws = await inWorkspace(db, ctx, roadmap.workspaceId);
  const card = await createCard(db, ws, {
    roadmapId: body.roadmap_id,
    columnId: body.column_id,
    title: body.title,
  });
  await updateCard(db, ws, {
    id: card.id,
    publicTitle: body.public_title ?? undefined,
    summaryJson: rich(body.description),
    objectiveId: body.objective_id,
    plannedFor: body.planned_for,
    isPublic: body.is_public,
  });
  await afterChange(ws);
  return card.id;
}

export async function apiUpdateCard(
  db: Db,
  ctx: AccountContext,
  id: string,
  body: z.output<typeof updateCardBody>,
) {
  const ws = await workspaceOf(db, ctx, roadmapCards, id, "Card");
  await updateCard(db, ws, {
    id,
    title: body.title,
    publicTitle: body.public_title,
    summaryJson: rich(body.description),
    objectiveId: body.objective_id,
    plannedFor: body.planned_for,
    isPublic: body.is_public,
  });
  if (body.column_id) {
    const card = await getCard(db, ws, id);
    if (card.columnId !== body.column_id) {
      await moveCard(db, ws, {
        id,
        columnId: body.column_id,
        prevId: null,
        nextId: null,
      });
    }
  }
  if (body.completed !== undefined) {
    await setCardCompleted(db, ws, id, body.completed);
  }
  await afterChange(ws);
}

export async function apiDeleteCard(db: Db, ctx: AccountContext, id: string) {
  const ws = await workspaceOf(db, ctx, roadmapCards, id, "Card");
  await deleteCard(db, ws, id);
  await afterChange(ws);
}

// ── Feedback ────────────────────────────────────────────────────────────

export async function apiCreateFeedback(
  db: Db,
  ctx: AccountContext,
  body: z.output<typeof createFeedbackBody>,
) {
  const ws = await boardWorkspace(db, ctx, body.board_id);
  const item = await createFeedback(db, ws, {
    boardId: body.board_id,
    title: body.title,
  });
  await updateFeedback(db, ws, {
    id: item.id,
    summaryJson: rich(body.details),
    statusId: body.status_id,
    objectiveId: body.objective_id,
    isPublic: body.is_public,
  });
  await afterChange(ws);
  return item.id;
}

async function boardWorkspace(db: Db, ctx: AccountContext, boardId: string) {
  const [board] = await db
    .select({ workspaceId: feedbackBoards.workspaceId })
    .from(feedbackBoards)
    .where(
      and(
        eq(feedbackBoards.accountId, ctx.accountId),
        eq(feedbackBoards.id, boardId),
      ),
    )
    .limit(1);
  if (!board) throw new NotFoundError("Board not found.");
  return inWorkspace(db, ctx, board.workspaceId);
}

export async function apiUpdateFeedback(
  db: Db,
  ctx: AccountContext,
  id: string,
  body: z.output<typeof updateFeedbackBody>,
) {
  const ws = await workspaceOf(db, ctx, feedbackItems, id, "Feedback");
  await updateFeedback(db, ws, {
    id,
    title: body.title,
    summaryJson: rich(body.details),
    boardId: body.board_id,
    statusId: body.status_id,
    objectiveId: body.objective_id,
    isPublic: body.is_public,
  });
  if (body.completed !== undefined) {
    await setFeedbackCompleted(db, ws, id, body.completed);
  }
  if (body.archived !== undefined) {
    await setFeedbackArchived(db, ws, id, body.archived);
  }
  await afterChange(ws);
}

export async function apiDeleteFeedback(
  db: Db,
  ctx: AccountContext,
  id: string,
) {
  const ws = await workspaceOf(db, ctx, feedbackItems, id, "Feedback");
  await deleteFeedback(db, ws, id);
  await afterChange(ws);
}

// ── Updates (changelog posts) ───────────────────────────────────────────

export async function apiCreateUpdate(
  db: Db,
  ctx: AccountContext,
  body: z.output<typeof createUpdateBody>,
) {
  const ws = await inWorkspace(db, ctx, body.workspace_id);
  const post = await createUpdate(db, ws, {});
  await patchUpdate(db, ws, {
    id: post.id,
    title: body.title,
    bodyJson: rich(body.content),
    categoryId: body.category_id,
    isPublic: body.is_public,
    pinned: body.pinned,
    emailSubscribers: body.email_subscribers ?? false,
  });
  return post.id;
}

export async function apiUpdateUpdate(
  db: Db,
  ctx: AccountContext,
  id: string,
  body: z.output<typeof updateUpdateBody>,
) {
  const ws = await workspaceOf(db, ctx, updates, id, "Update");
  await patchUpdate(db, ws, {
    id,
    title: body.title,
    bodyJson: rich(body.content),
    categoryId: body.category_id,
    isPublic: body.is_public,
    pinned: body.pinned,
    emailSubscribers: body.email_subscribers,
  });
  if (body.status === "published") {
    const { post, scheduledFor } = await publishUpdate(
      db,
      ws,
      id,
      body.publish_at ? new Date(body.publish_at) : undefined,
    );
    if (scheduledFor) await schedulePublish(post.id, scheduledFor);
    else {
      await notify({ type: "send-update", updateId: post.id });
      await notify({ type: "idea-shipped", updateId: post.id });
    }
  } else if (body.status === "draft") {
    await unpublishUpdate(db, ws, id);
  }
  await afterChange(ws, false);
}

export async function apiDeleteUpdate(db: Db, ctx: AccountContext, id: string) {
  const ws = await workspaceOf(db, ctx, updates, id, "Update");
  await deleteUpdate(db, ws, id);
  await afterChange(ws, false);
}
