import { z } from "zod";

// Updates / changelog (doc 23).

const id = z.uuid();

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour"),
});
export const editUpdateCategorySchema = updateCategorySchema.extend({ id });

const richText = z
  .record(z.string(), z.unknown())
  .refine((v) => v.type === "doc", "Invalid content")
  .refine((v) => JSON.stringify(v).length <= 200_000, "Too long");

export const UPDATE_TABS = ["published", "scheduled", "draft"] as const;
export type UpdateTab = (typeof UPDATE_TABS)[number];

export const updateFilterSchema = z.object({
  tab: z.enum(UPDATE_TABS).default("published"),
  q: z.string().trim().max(100).optional(),
  categoryId: id.optional(),
});
export type UpdateFilter = z.input<typeof updateFilterSchema>;

/** New draft, optionally announcing a completed card ("Announce…"). */
export const createUpdateSchema = z.object({ cardId: id.optional() });

/** Autosave patch: only the fields that changed are sent. */
export const patchUpdateSchema = z.object({
  id,
  title: z.string().trim().min(1, "Enter a title").max(200).optional(),
  bodyJson: richText.nullable().optional(),
  categoryId: id.nullable().optional(),
  isPublic: z.boolean().optional(),
  pinned: z.boolean().optional(),
  emailSubscribers: z.boolean().optional(),
  /** Storage key of an uploaded image, or null to remove. */
  cover: z.string().max(300).nullable().optional(),
});
export type PatchUpdateInput = z.input<typeof patchUpdateSchema>;

export const updateCardsSchema = z.object({
  id,
  cardIds: z.array(id).max(50),
});

export const updateIdSchema = z.object({ id });
export const cardSearchSchema = z.object({ q: z.string().trim().max(100) });
