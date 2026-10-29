import { z } from "zod";

// Articles / knowledge base (doc 25).

const id = z.uuid();
const neighbour = z.uuid().nullable();

/** One emoji (or a short symbol) as the category's icon (doc 25 A5). */
const icon = z
  .string()
  .trim()
  .min(1, "Pick an icon")
  .max(16)
  .refine((v) => [...new Intl.Segmenter().segment(v)].length === 1, {
    message: "Use one emoji",
  });

export const articleCategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60),
  description: z.string().trim().max(200).default(""),
  icon,
});
export type ArticleCategoryInput = z.input<typeof articleCategorySchema>;
export const editArticleCategorySchema = articleCategorySchema.extend({ id });

export const moveArticleCategorySchema = z.object({
  id,
  prevId: neighbour,
  nextId: neighbour,
});

const richText = z
  .record(z.string(), z.unknown())
  .refine((v) => v.type === "doc", "Invalid content")
  .refine((v) => JSON.stringify(v).length <= 300_000, "Too long");

export const ARTICLE_TABS = ["published", "draft"] as const;
export type ArticleTab = (typeof ARTICLE_TABS)[number];

export const articleFilterSchema = z.object({
  tab: z.enum(ARTICLE_TABS).default("published"),
  q: z.string().trim().max(100).optional(),
  /** A category id, or "none" for uncategorised articles. */
  category: z.union([id, z.literal("none")]).optional(),
});
export type ArticleFilter = z.input<typeof articleFilterSchema>;

/** New draft, optionally in a category. */
export const createArticleSchema = z.object({ categoryId: id.optional() });

/** Autosave patch: only the fields that changed are sent. */
export const patchArticleSchema = z.object({
  id,
  title: z.string().trim().min(1, "Enter a title").max(200).optional(),
  excerpt: z.string().trim().max(300).optional(),
  bodyJson: richText.nullable().optional(),
  categoryId: id.nullable().optional(),
  isPublic: z.boolean().optional(),
  featured: z.boolean().optional(),
});
export type PatchArticleInput = z.input<typeof patchArticleSchema>;

export const articleIdSchema = z.object({ id });

/** Reorder within a category (neighbours are articles of the same one). */
export const moveArticleSchema = z.object({
  id,
  prevId: neighbour,
  nextId: neighbour,
});

export const ARTICLE_RATINGS = ["dislike", "neutral", "like"] as const;
export type ArticleRating = (typeof ARTICLE_RATINGS)[number];

/** Public "Was this helpful?" (doc 25 A4); null clears the rating. */
export const rateArticleSchema = z.object({
  articleId: id,
  value: z.enum(ARTICLE_RATINGS).nullable(),
});
