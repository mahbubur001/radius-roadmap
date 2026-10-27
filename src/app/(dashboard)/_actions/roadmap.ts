"use server";

import {
  cardFlagSchema,
  cardIdSchema,
  categorySchema,
  createCardSchema,
  createColumnSchema,
  createFeatureSchema,
  createRoadmapSchema,
  moveCardSchema,
  moveColumnSchema,
  roadmapIdSchema,
  tagSchema,
  updateCardSchema,
  updateCategorySchema,
  updateColumnSchema,
  updateFeatureSchema,
  updateRoadmapSchema,
} from "@/lib/schemas/roadmap";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidatePublic, invalidateSite } from "@/server/public-cache";
import {
  addFeature,
  createCard,
  deleteCard,
  deleteFeature,
  getCardDetail,
  moveCard,
  setCardArchived,
  setCardCompleted,
  updateCard,
  updateFeature,
} from "@/server/services/cards";
import type { WorkspaceContext } from "@/server/services/context";
import {
  createCategory,
  createColumn,
  createRoadmap,
  createTag,
  deleteCategory,
  deleteColumn,
  deleteRoadmap,
  deleteTag,
  moveColumn,
  updateCategory,
  updateColumn,
  updateRoadmap,
} from "@/server/services/roadmaps";
import { listVoters } from "@/server/services/votes";

// Every mutation here changes what the public site may show, so it drops
// the workspace's public cache afterwards (and the site's workspace list,
// which depends on whether any roadmap is public).
async function mutate<T>(ctx: WorkspaceContext, run: () => Promise<T>) {
  const result = await run();
  invalidatePublic(ctx.workspaceId);
  invalidateSite(ctx.accountId);
  return result;
}

// ── Roadmaps and columns (admin+) ───────────────────────────────────────

export const createRoadmapAction = workspaceAction(
  createRoadmapSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const roadmap = await createRoadmap(db, ctx, input);
      return { slug: roadmap.slug };
    }),
);

export const updateRoadmapAction = workspaceAction(
  updateRoadmapSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      await updateRoadmap(db, ctx, input);
    }),
);

export const deleteRoadmapAction = workspaceAction(
  roadmapIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteRoadmap(db, ctx, id)),
);

export const createColumnAction = workspaceAction(
  createColumnSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const column = await createColumn(db, ctx, input);
      return { id: column?.id ?? "" };
    }),
);

export const updateColumnAction = workspaceAction(
  updateColumnSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      await updateColumn(db, ctx, input);
    }),
);

export const moveColumnAction = workspaceAction(
  moveColumnSchema,
  async (ctx, input) => mutate(ctx, () => moveColumn(db, ctx, input)),
);

export const deleteColumnAction = workspaceAction(
  cardIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteColumn(db, ctx, id)),
);

// ── Cards (everyone with access) ────────────────────────────────────────

export const getCardAction = workspaceAction(
  cardIdSchema,
  async (ctx, { id }) => {
    const [card, voters] = await Promise.all([
      getCardDetail(db, ctx, id),
      listVoters(db, ctx, id),
    ]);
    return { card, voters };
  },
);

export const createCardAction = workspaceAction(
  createCardSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const card = await createCard(db, ctx, input);
      return { id: card.id, slug: card.slug, position: card.position };
    }),
);

export const updateCardAction = workspaceAction(
  updateCardSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const card = await updateCard(db, ctx, input);
      return { updatedAt: card.updatedAt.toISOString() };
    }),
);

export const moveCardAction = workspaceAction(
  moveCardSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const card = await moveCard(db, ctx, input);
      return {
        position: card?.position ?? "",
        completed: !!card?.completedAt,
      };
    }),
);

export const setCardCompletedAction = workspaceAction(
  cardFlagSchema,
  async (ctx, { id, value }) =>
    mutate(ctx, async () => {
      await setCardCompleted(db, ctx, id, value);
    }),
);

export const setCardArchivedAction = workspaceAction(
  cardFlagSchema,
  async (ctx, { id, value }) =>
    mutate(ctx, async () => {
      await setCardArchived(db, ctx, id, value);
    }),
);

export const deleteCardAction = workspaceAction(
  cardIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteCard(db, ctx, id)),
);

export const addFeatureAction = workspaceAction(
  createFeatureSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const feature = await addFeature(db, ctx, input);
      return { id: feature?.id ?? "" };
    }),
);

export const updateFeatureAction = workspaceAction(
  updateFeatureSchema,
  async (ctx, input) => mutate(ctx, () => updateFeature(db, ctx, input)),
);

export const deleteFeatureAction = workspaceAction(
  cardIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteFeature(db, ctx, id)),
);

// ── Categories (admin+) and tags ────────────────────────────────────────

export const createCategoryAction = workspaceAction(
  categorySchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const category = await createCategory(db, ctx, input);
      return { id: category?.id ?? "" };
    }),
);

export const updateCategoryAction = workspaceAction(
  updateCategorySchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      await updateCategory(db, ctx, input);
    }),
);

export const deleteCategoryAction = workspaceAction(
  cardIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteCategory(db, ctx, id)),
);

export const createTagAction = workspaceAction(tagSchema, async (ctx, input) =>
  mutate(ctx, async () => {
    const tag = await createTag(db, ctx, input);
    return { id: tag.id, name: tag.name };
  }),
);

export const deleteTagAction = workspaceAction(
  cardIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteTag(db, ctx, id)),
);
