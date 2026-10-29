"use server";

import { z } from "zod";
import {
  cardSearchSchema,
  createUpdateSchema,
  editUpdateCategorySchema,
  patchUpdateSchema,
  publishUpdateSchema,
  updateCardsSchema,
  updateCategorySchema,
  updateIdSchema,
} from "@/lib/schemas/updates";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidatePublic, invalidateSite } from "@/server/public-cache";
import { notify, schedulePublish } from "@/server/queue/notifications";
import type { WorkspaceContext } from "@/server/services/context";
import { assertRole } from "@/server/services/context";
import {
  removeSubscriber,
  subscribersCsv,
} from "@/server/services/subscribers";
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
  publishUpdate,
  searchCardsForUpdate,
  setUpdateCards,
  unpublishUpdate,
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

/** Publish now, or schedule (a delayed job publishes it, doc 23 U3). */
export const publishUpdateAction = workspaceAction(
  publishUpdateSchema,
  async (ctx, { id, at }) => {
    const { post, scheduledFor } = await publishUpdate(
      db,
      ctx,
      id,
      at ? new Date(at) : undefined,
    );
    if (scheduledFor) await schedulePublish(post.id, scheduledFor);
    else await notify({ type: "send-update", updateId: post.id });
    invalidatePublic(ctx.workspaceId);
    invalidateSite(ctx.accountId);
    return {
      status: post.status,
      slug: post.slug,
      publishAt: post.publishAt?.toISOString() ?? null,
      publishedAt: post.publishedAt?.toISOString() ?? null,
    };
  },
);

export const unpublishUpdateAction = workspaceAction(
  updateIdSchema,
  async (ctx, { id }) => {
    await unpublishUpdate(db, ctx, id);
    invalidatePublic(ctx.workspaceId);
    invalidateSite(ctx.accountId);
  },
);

/** Removes a subscriber (admins). They can subscribe again later. */
export const removeSubscriberAction = workspaceAction(
  updateIdSchema,
  async (ctx, { id }) => {
    assertRole(ctx, "admin");
    await removeSubscriber(db, ctx, id);
  },
);

export const exportSubscribersAction = workspaceAction(
  z.looseObject({}),
  async (ctx) => {
    assertRole(ctx, "admin");
    return {
      filename: `${ctx.workspaceSlug}-subscribers-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: await subscribersCsv(db, ctx),
    };
  },
);
