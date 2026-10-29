"use server";

import {
  commentIdSchema,
  commentTargetSchema,
  teamCommentSchema,
  updateCommentSchema,
} from "@/lib/schemas/comments";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import { notify } from "@/server/queue/notifications";
import {
  addTeamComment,
  approveComment,
  type CommentTarget,
  deleteComment,
  listTeamComments,
  updateTeamComment,
} from "@/server/services/comments";

// Team side of comments on ideas and roadmap cards (doc 20 step 7). Public
// comments change what the public site shows, so mutations drop its cache.

function toTarget(v: { feedbackId?: string; cardId?: string }): CommentTarget {
  return v.feedbackId
    ? { feedbackId: v.feedbackId }
    : { cardId: v.cardId ?? "" };
}

export const listCommentsAction = workspaceAction(
  commentTargetSchema,
  async (ctx, input) => listTeamComments(db, ctx, toTarget(input)),
);

export const addCommentAction = workspaceAction(
  teamCommentSchema,
  async (ctx, { body, internal, ...target }) => {
    const row = await addTeamComment(db, ctx, {
      target: toTarget(target),
      body,
      internal,
    });
    if (!internal) invalidatePublic(ctx.workspaceId);
    await notify({ type: "new-comment", commentId: row.id });
    return { id: row.id, createdAt: row.createdAt };
  },
);

export const updateCommentAction = workspaceAction(
  updateCommentSchema,
  async (ctx, input) => {
    await updateTeamComment(db, ctx, input);
    invalidatePublic(ctx.workspaceId);
  },
);

export const approveCommentAction = workspaceAction(
  commentIdSchema,
  async (ctx, { id }) => {
    await approveComment(db, ctx, id);
    invalidatePublic(ctx.workspaceId);
  },
);

export const deleteCommentAction = workspaceAction(
  commentIdSchema,
  async (ctx, { id }) => {
    await deleteComment(db, ctx, id);
    invalidatePublic(ctx.workspaceId);
  },
);
