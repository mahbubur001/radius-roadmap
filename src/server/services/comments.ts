import { and, asc, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  comments,
  feedbackItems,
  follows,
  roadmapCards,
  roadmaps,
  trackedUsers,
  user,
} from "@/server/db/schema";
import { getCard } from "./cards";
import {
  ForbiddenError,
  NotFoundError,
  type PublicContext,
  seesAllWorkspaces,
  type WorkspaceContext,
} from "./context";
import { getFeedback } from "./feedback";

// Comments on ideas (feedback items) and roadmap cards, public and team
// (doc 20 D3, step 7), plus voters following ideas. Visitors' comments can be
// held for approval; team "internal notes" are never public. Every query is
// scoped by account (+ workspace for the team).

/** What a comment is on: exactly one of the two. */
export type CommentTarget = { feedbackId: string } | { cardId: string };

function targetWhere(target: CommentTarget): SQL {
  return "feedbackId" in target
    ? eq(comments.feedbackId, target.feedbackId)
    : eq(comments.cardId, target.cardId);
}

/** Visible to the public: approved, not internal, not deleted. */
const isPublicComment = and(
  eq(comments.review, "approved"),
  eq(comments.isInternal, false),
  isNull(comments.deletedAt),
) as SQL;

/** Keeps feedback_items.comment_count equal to its public comments. */
async function recount(tx: DbOrTx, feedbackId: string | null) {
  if (!feedbackId) return;
  await tx
    .update(feedbackItems)
    .set({
      commentCount: sql`(select count(*)::int from ${comments} where ${comments.feedbackId} = ${feedbackId} and ${comments.review} = 'approved' and not ${comments.isInternal} and ${comments.deletedAt} is null)`,
    })
    .where(eq(feedbackItems.id, feedbackId));
}

const author = {
  authorUserId: comments.authorUserId,
  memberName: user.name,
  visitorName: trackedUsers.name,
};

/** A visitor's display name: never their email. */
function displayName(r: {
  authorUserId: string | null;
  memberName: string | null;
  visitorName: string | null;
}) {
  if (r.authorUserId) return r.memberName ?? "Team";
  return r.visitorName?.trim() || "Guest";
}

// ── Public (the caller has checked the target is visible) ──────────────

export async function listPublicComments(
  db: Db,
  ctx: PublicContext,
  target: CommentTarget,
) {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      ...author,
    })
    .from(comments)
    .leftJoin(user, eq(user.id, comments.authorUserId))
    .leftJoin(trackedUsers, eq(trackedUsers.id, comments.authorTrackedUserId))
    .where(
      and(
        eq(comments.accountId, ctx.accountId),
        targetWhere(target),
        isPublicComment,
      ),
    )
    .orderBy(asc(comments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    author: displayName(r),
    team: !!r.authorUserId,
    createdAt: r.createdAt.toISOString(),
    edited: !!r.editedAt,
  }));
}

export async function addPublicComment(
  db: Db,
  ctx: PublicContext,
  input: {
    target: CommentTarget;
    workspaceId: string;
    body: string;
    trackedUserId: string;
    /** Workspace setting "approve comments first". */
    holdForApproval: boolean;
  },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(comments)
      .values({
        accountId: ctx.accountId,
        workspaceId: input.workspaceId,
        ...input.target,
        body: input.body,
        authorTrackedUserId: input.trackedUserId,
        review: input.holdForApproval ? "pending" : "approved",
      })
      .returning();
    if (!row) throw new Error("Failed to add the comment.");
    await recount(tx, row.feedbackId);
    return row;
  });
}

// ── Team (dashboard) ───────────────────────────────────────────────────

/** Checks the target belongs to the caller's workspace. */
async function ownTarget(db: Db, ctx: WorkspaceContext, target: CommentTarget) {
  if ("feedbackId" in target) await getFeedback(db, ctx, target.feedbackId);
  else await getCard(db, ctx, target.cardId);
}

/** Every live comment on an idea or card: public, pending and internal. */
export async function listTeamComments(
  db: Db,
  ctx: WorkspaceContext,
  target: CommentTarget,
) {
  await ownTarget(db, ctx, target);
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      isInternal: comments.isInternal,
      review: comments.review,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      ...author,
    })
    .from(comments)
    .leftJoin(user, eq(user.id, comments.authorUserId))
    .leftJoin(trackedUsers, eq(trackedUsers.id, comments.authorTrackedUserId))
    .where(
      and(
        eq(comments.accountId, ctx.accountId),
        eq(comments.workspaceId, ctx.workspaceId),
        targetWhere(target),
        isNull(comments.deletedAt),
      ),
    )
    .orderBy(asc(comments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    internal: r.isInternal,
    pending: r.review === "pending",
    author: displayName(r),
    authorUserId: r.authorUserId,
    team: !!r.authorUserId,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
  }));
}

export type TeamComment = Awaited<ReturnType<typeof listTeamComments>>[number];

/** A team reply (public) or an internal note (never public). */
export async function addTeamComment(
  db: Db,
  ctx: WorkspaceContext,
  input: { target: CommentTarget; body: string; internal: boolean },
) {
  await ownTarget(db, ctx, input.target);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(comments)
      .values({
        accountId: ctx.accountId,
        workspaceId: ctx.workspaceId,
        ...input.target,
        body: input.body,
        authorUserId: ctx.userId,
        isInternal: input.internal,
      })
      .returning();
    if (!row) throw new Error("Failed to add the comment.");
    await recount(tx, row.feedbackId);
    return row;
  });
}

async function liveComment(db: Db, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select({
      authorUserId: comments.authorUserId,
      feedbackId: comments.feedbackId,
      cardId: comments.cardId,
    })
    .from(comments)
    .where(
      and(
        eq(comments.accountId, ctx.accountId),
        eq(comments.workspaceId, ctx.workspaceId),
        eq(comments.id, id),
        isNull(comments.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Comment not found.");
  return row;
}

/** Anyone on the team can approve a visitor's comment (triage). */
export async function approveComment(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const row = await liveComment(db, ctx, id);
  await db.transaction(async (tx) => {
    await tx
      .update(comments)
      .set({ review: "approved" })
      .where(eq(comments.id, id));
    await recount(tx, row.feedbackId);
  });
}

/** Authors edit their own team comments. */
export async function updateTeamComment(
  db: Db,
  ctx: WorkspaceContext,
  input: { id: string; body: string },
) {
  const row = await liveComment(db, ctx, input.id);
  if (row.authorUserId !== ctx.userId) throw new ForbiddenError();
  await db
    .update(comments)
    .set({ body: input.body, editedAt: new Date() })
    .where(eq(comments.id, input.id));
}

/**
 * Visitors' comments: anyone on the team may remove them (moderation).
 * Team comments: their author, or an owner/admin.
 */
export async function deleteComment(db: Db, ctx: WorkspaceContext, id: string) {
  const row = await liveComment(db, ctx, id);
  const allowed =
    !row.authorUserId ||
    row.authorUserId === ctx.userId ||
    seesAllWorkspaces(ctx);
  if (!allowed) throw new ForbiddenError();
  await db.transaction(async (tx) => {
    await tx
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(eq(comments.id, id));
    await recount(tx, row.feedbackId);
  });
}

/** Visitors' comments waiting for approval, newest first (moderation). */
export async function listPendingComments(db: Db, ctx: WorkspaceContext) {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      feedbackId: comments.feedbackId,
      cardId: comments.cardId,
      ideaTitle: feedbackItems.title,
      cardTitle: roadmapCards.title,
      roadmapSlug: roadmaps.slug,
      ...author,
    })
    .from(comments)
    .leftJoin(user, eq(user.id, comments.authorUserId))
    .leftJoin(trackedUsers, eq(trackedUsers.id, comments.authorTrackedUserId))
    .leftJoin(feedbackItems, eq(feedbackItems.id, comments.feedbackId))
    .leftJoin(roadmapCards, eq(roadmapCards.id, comments.cardId))
    .leftJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .where(
      and(
        eq(comments.accountId, ctx.accountId),
        eq(comments.workspaceId, ctx.workspaceId),
        eq(comments.review, "pending"),
        isNull(comments.deletedAt),
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    author: displayName(r),
    createdAt: r.createdAt,
    target: r.feedbackId
      ? { kind: "idea" as const, id: r.feedbackId, title: r.ideaTitle ?? "" }
      : {
          kind: "card" as const,
          id: r.cardId ?? "",
          title: r.cardTitle ?? "",
          roadmap: r.roadmapSlug ?? "",
        },
  }));
}

export async function pendingCommentCount(db: Db, ctx: WorkspaceContext) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(
        eq(comments.accountId, ctx.accountId),
        eq(comments.workspaceId, ctx.workspaceId),
        eq(comments.review, "pending"),
        isNull(comments.deletedAt),
      ),
    );
  return row?.n ?? 0;
}

// ── Follows (voters following ideas; emails come in Phase 4) ───────────

export async function setIdeaFollow(
  db: Db,
  ctx: PublicContext,
  feedbackId: string,
  trackedUserId: string,
  follow: boolean,
) {
  if (follow) {
    await db
      .insert(follows)
      .values({ accountId: ctx.accountId, feedbackId, trackedUserId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(follows)
      .where(
        and(
          eq(follows.accountId, ctx.accountId),
          eq(follows.feedbackId, feedbackId),
          eq(follows.trackedUserId, trackedUserId),
        ),
      );
  }
}

/** Ideas in a workspace this voter follows. */
export async function followedIdeaIds(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  trackedUserId: string,
) {
  const rows = await db
    .select({ id: follows.feedbackId })
    .from(follows)
    .innerJoin(feedbackItems, eq(feedbackItems.id, follows.feedbackId))
    .where(
      and(
        eq(follows.accountId, ctx.accountId),
        eq(follows.trackedUserId, trackedUserId),
        eq(feedbackItems.workspaceId, workspaceId),
      ),
    );
  return rows.map((r) => r.id);
}

export type PendingComment = Awaited<
  ReturnType<typeof listPendingComments>
>[number];
