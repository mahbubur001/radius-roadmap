"use server";

import {
  bulkUpdateFeedbackSchema,
  createBoardSchema,
  createFeedbackSchema,
  feedbackFlagSchema,
  feedbackIdSchema,
  linkCardSchema,
  mergeFeedbackSchema,
  moveStatusSchema,
  noInputSchema,
  pickerSearchSchema,
  pushToRoadmapSchema,
  reviewFeedbackSchema,
  statusSchema,
  updateBoardSchema,
  updateFeedbackSchema,
  updateStatusSchema,
} from "@/lib/schemas/feedback";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidatePublic, invalidateSite } from "@/server/public-cache";
import type { WorkspaceContext } from "@/server/services/context";
import {
  bulkUpdateFeedback,
  createFeedback,
  deleteFeedback,
  duplicateFeedback,
  getFeedbackDetail,
  mergeFeedback,
  reviewFeedback,
  searchFeedback,
  setFeedbackArchived,
  setFeedbackCompleted,
  updateFeedback,
} from "@/server/services/feedback";
import {
  createBoard,
  createStatus,
  deleteBoard,
  deleteStatus,
  moveStatus,
  updateBoard,
  updateStatus,
} from "@/server/services/feedback-boards";
import {
  linkCard,
  linkedCards,
  pushToRoadmap,
  roadmapTargets,
  searchCards,
  unlinkCard,
} from "@/server/services/feedback-links";
import { listFeedbackVoters } from "@/server/services/votes";

// Feedback changes what the public site may show (Phase 3 public pages), so
// every mutation drops the workspace's public cache afterwards (and the
// site's workspace list, which depends on which boards are public).
async function mutate<T>(ctx: WorkspaceContext, run: () => Promise<T>) {
  const result = await run();
  invalidatePublic(ctx.workspaceId);
  invalidateSite(ctx.accountId);
  return result;
}

export const getFeedbackAction = workspaceAction(
  feedbackIdSchema,
  async (ctx, { id }) => {
    const [item, voters, cards] = await Promise.all([
      getFeedbackDetail(db, ctx, id),
      listFeedbackVoters(db, ctx, id),
      linkedCards(db, ctx, id),
    ]);
    return { item, voters, cards };
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

// ── Triage and bulk edits (everyone with access) ────────────────────────

export const reviewFeedbackAction = workspaceAction(
  reviewFeedbackSchema,
  async (ctx, { ids, action }) =>
    mutate(ctx, () => reviewFeedback(db, ctx, ids, action)),
);

export const bulkUpdateFeedbackAction = workspaceAction(
  bulkUpdateFeedbackSchema,
  async (ctx, input) => mutate(ctx, () => bulkUpdateFeedback(db, ctx, input)),
);

// ── Boards and statuses (admin+) ────────────────────────────────────────

export const createBoardAction = workspaceAction(
  createBoardSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const board = await createBoard(db, ctx, input);
      return { id: board.id, slug: board.slug };
    }),
);

export const updateBoardAction = workspaceAction(
  updateBoardSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const board = await updateBoard(db, ctx, input);
      return { slug: board.slug };
    }),
);

export const deleteBoardAction = workspaceAction(
  feedbackIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteBoard(db, ctx, id)),
);

export const createStatusAction = workspaceAction(
  statusSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const status = await createStatus(db, ctx, input);
      return { id: status.id, position: status.position };
    }),
);

export const updateStatusAction = workspaceAction(
  updateStatusSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      await updateStatus(db, ctx, input);
    }),
);

export const moveStatusAction = workspaceAction(
  moveStatusSchema,
  async (ctx, input) => mutate(ctx, () => moveStatus(db, ctx, input)),
);

export const deleteStatusAction = workspaceAction(
  feedbackIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteStatus(db, ctx, id)),
);

// ── Roadmap links, merge, duplicate (everyone with access) ──────────────

export const roadmapTargetsAction = workspaceAction(
  noInputSchema,
  async (ctx) => roadmapTargets(db, ctx),
);

export const searchCardsAction = workspaceAction(
  pickerSearchSchema,
  async (ctx, { q }) => searchCards(db, ctx, q),
);

export const searchFeedbackAction = workspaceAction(
  pickerSearchSchema,
  async (ctx, { q, excludeId }) => searchFeedback(db, ctx, q, excludeId),
);

export const pushToRoadmapAction = workspaceAction(
  pushToRoadmapSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const card = await pushToRoadmap(db, ctx, input);
      return { cardId: card.id };
    }),
);

export const linkCardAction = workspaceAction(
  linkCardSchema,
  async (ctx, { feedbackId, cardId }) =>
    mutate(ctx, () => linkCard(db, ctx, feedbackId, cardId)),
);

export const unlinkCardAction = workspaceAction(
  linkCardSchema,
  async (ctx, { feedbackId, cardId }) =>
    mutate(ctx, () => unlinkCard(db, ctx, feedbackId, cardId)),
);

export const mergeFeedbackAction = workspaceAction(
  mergeFeedbackSchema,
  async (ctx, { sourceId, targetId }) =>
    mutate(ctx, async () => {
      const merged = await mergeFeedback(db, ctx, sourceId, targetId);
      return { id: merged.id };
    }),
);

export const duplicateFeedbackAction = workspaceAction(
  feedbackIdSchema,
  async (ctx, { id }) =>
    mutate(ctx, async () => {
      const copy = await duplicateFeedback(db, ctx, id);
      return { id: copy.id };
    }),
);
