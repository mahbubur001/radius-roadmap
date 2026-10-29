"use server";

import {
  cardSearchSchema,
  createUpdateSchema,
  editUpdateCategorySchema,
  patchUpdateSchema,
  updateCardsSchema,
  updateCategorySchema,
  updateIdSchema,
} from "@/lib/schemas/updates";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import type { WorkspaceContext } from "@/server/services/context";
import {
  createUpdateCategory,
  deleteUpdateCategory,
  editUpdateCategory,
} from "@/server/services/update-categories";
import {
  createUpdate,
  deleteUpdate,
  duplicateUpdate,
  patchUpdate,
  searchCardsForUpdate,
  setUpdateCards,
} from "@/server/services/updates";

// Updates (doc 23). Published posts are public, so changes drop the
// workspace's public cache.
async function mutate<T>(ctx: WorkspaceContext, run: () => Promise<T>) {
  const result = await run();
  invalidatePublic(ctx.workspaceId);
  return result;
}

export const createUpdateAction = workspaceAction(
  createUpdateSchema,
  async (ctx, input) => {
    const row = await createUpdate(db, ctx, input);
    return { id: row.id };
  },
);

export const patchUpdateAction = workspaceAction(
  patchUpdateSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const row = await patchUpdate(db, ctx, input);
      return { updatedAt: row.updatedAt.toISOString() };
    }),
);

export const setUpdateCardsAction = workspaceAction(
  updateCardsSchema,
  async (ctx, { id, cardIds }) =>
    mutate(ctx, () => setUpdateCards(db, ctx, id, cardIds)),
);

export const deleteUpdateAction = workspaceAction(
  updateIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteUpdate(db, ctx, id)),
);

export const duplicateUpdateAction = workspaceAction(
  updateIdSchema,
  async (ctx, { id }) => {
    const row = await duplicateUpdate(db, ctx, id);
    return { id: row.id };
  },
);

export const searchCardsForUpdateAction = workspaceAction(
  cardSearchSchema,
  async (ctx, { q }) => searchCardsForUpdate(db, ctx, q),
);

export const createUpdateCategoryAction = workspaceAction(
  updateCategorySchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const row = await createUpdateCategory(db, ctx, input);
      return { id: row.id };
    }),
);

export const editUpdateCategoryAction = workspaceAction(
  editUpdateCategorySchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      await editUpdateCategory(db, ctx, input);
    }),
);

export const deleteUpdateCategoryAction = workspaceAction(
  updateIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteUpdateCategory(db, ctx, id)),
);
