"use server";

import {
  articleCategorySchema,
  articleIdSchema,
  createArticleSchema,
  editArticleCategorySchema,
  moveArticleCategorySchema,
  moveArticleSchema,
  patchArticleSchema,
} from "@/lib/schemas/articles";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidatePublic, invalidateSite } from "@/server/public-cache";
import {
  createArticleCategory,
  deleteArticleCategory,
  moveArticleCategory,
  updateArticleCategory,
} from "@/server/services/article-categories";
import {
  createArticle,
  deleteArticle,
  duplicateArticle,
  moveArticle,
  patchArticle,
  publishArticle,
  unpublishArticle,
} from "@/server/services/articles";
import type { WorkspaceContext } from "@/server/services/context";

// Articles (doc 25). Published articles are public, so changes drop the
// workspace's public cache; publishing can also add the Articles tab, which
// lives in the site's cached workspace data.
async function mutate<T>(
  ctx: WorkspaceContext,
  run: () => Promise<T>,
  site = false,
) {
  const result = await run();
  invalidatePublic(ctx.workspaceId);
  if (site) invalidateSite(ctx.accountId);
  return result;
}

export const createArticleAction = workspaceAction(
  createArticleSchema,
  async (ctx, input) => {
    const row = await createArticle(db, ctx, input);
    return { id: row.id };
  },
);

export const patchArticleAction = workspaceAction(
  patchArticleSchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const row = await patchArticle(db, ctx, input);
      return { updatedAt: row.updatedAt.toISOString() };
    }),
);

export const publishArticleAction = workspaceAction(
  articleIdSchema,
  async (ctx, { id }) =>
    mutate(
      ctx,
      async () => {
        const row = await publishArticle(db, ctx, id);
        return {
          slug: row.slug,
          publishedAt: row.publishedAt?.toISOString() ?? null,
        };
      },
      true,
    ),
);

export const unpublishArticleAction = workspaceAction(
  articleIdSchema,
  async (ctx, { id }) =>
    mutate(
      ctx,
      async () => {
        await unpublishArticle(db, ctx, id);
      },
      true,
    ),
);

export const deleteArticleAction = workspaceAction(
  articleIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteArticle(db, ctx, id), true),
);

export const duplicateArticleAction = workspaceAction(
  articleIdSchema,
  async (ctx, { id }) => {
    const row = await duplicateArticle(db, ctx, id);
    return { id: row.id };
  },
);

export const moveArticleAction = workspaceAction(
  moveArticleSchema,
  async (ctx, input) => mutate(ctx, () => moveArticle(db, ctx, input)),
);

export const createArticleCategoryAction = workspaceAction(
  articleCategorySchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      const row = await createArticleCategory(db, ctx, input);
      return { id: row.id, slug: row.slug };
    }),
);

export const editArticleCategoryAction = workspaceAction(
  editArticleCategorySchema,
  async (ctx, input) =>
    mutate(ctx, async () => {
      await updateArticleCategory(db, ctx, input);
    }),
);

export const moveArticleCategoryAction = workspaceAction(
  moveArticleCategorySchema,
  async (ctx, input) => mutate(ctx, () => moveArticleCategory(db, ctx, input)),
);

export const deleteArticleCategoryAction = workspaceAction(
  articleIdSchema,
  async (ctx, { id }) => mutate(ctx, () => deleteArticleCategory(db, ctx, id)),
);
