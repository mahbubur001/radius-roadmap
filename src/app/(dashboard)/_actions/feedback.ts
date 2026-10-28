"use server";

import {
  createFeedbackSchema,
  feedbackFlagSchema,
  feedbackIdSchema,
  updateFeedbackSchema,
} from "@/lib/schemas/feedback";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import type { WorkspaceContext } from "@/server/services/context";
import {
  createFeedback,
  deleteFeedback,
  getFeedbackDetail,
  setFeedbackArchived,
  setFeedbackCompleted,
  updateFeedback,
} from "@/server/services/feedback";
import { listFeedbackVoters } from "@/server/services/votes";

// Feedback changes what the public site may show (Phase 3 public pages), so
// every mutation drops the workspace's public cache afterwards.
async function mutate<T>(ctx: WorkspaceContext, run: () => Promise<T>) {
  const result = await run();
  invalidatePublic(ctx.workspaceId);
  return result;
}

export const getFeedbackAction = workspaceAction(
  feedbackIdSchema,
  async (ctx, { id }) => {
    const [item, voters] = await Promise.all([
      getFeedbackDetail(db, ctx, id),
      listFeedbackVoters(db, ctx, id),
    ]);
    return { item, voters };
  },
);

export const createFeedbackAction = workspaceAction(
  createFeedbackSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const item = await createFeedback(db, ctx, input);
      return { id: item.id };
    }),
);

export const updateFeedbackAction = workspaceAction(
  updateFeedbackSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const item = await updateFeedback(db, ctx, input);
      return {
        updatedAt: item.updatedAt.toISOString(),
        completed: !!item.completedAt,
      };
    }),
);

export const setFeedbackCompletedAction = workspaceAction(
  feedbackFlagSchema,
  async (ctx, { id, value }) =>
    mutate(ctx, async () => {
      const item = await setFeedbackCompleted(db, ctx, id, value);
      return { statusId: item.statusId };
    }),
);

export const setFeedbackArchivedAction = workspaceAction(
  feedbackFlagSchema,
  async (ctx, { id, value }) =>
    mutate(ctx, async () => {
      await setFeedbackArchived(db, ctx, id, value);
    }),
);

export const deleteFeedbackAction = workspaceAction(
  feedbackIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteFeedback(db, ctx, id)),
);
