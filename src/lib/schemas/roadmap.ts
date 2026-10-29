import { z } from "zod";
import {
  ATTACHMENT_TYPES,
  type AttachmentType,
  MAX_ATTACHMENT_BYTES,
} from "./upload";

const id = z.uuid();
const neighbour = z.uuid().nullable();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

export const roadmapDisplaySchema = z.object({
  showTitle: z.boolean(),
  showSummary: z.boolean(),
  showTags: z.boolean(),
  showAttachments: z.boolean(),
  showVotes: z.boolean(),
  showObjectives: z.boolean(),
  /** "Card details" in LoopedIn. */
  showDescriptions: z.boolean(),
  showFeatures: z.boolean(),
  showFeatureProgress: z.boolean(),
  showDates: z.boolean(),
  showImageHeaders: z.boolean(),
  showCompleted: z.boolean(),
});

export type RoadmapDisplaySettings = z.infer<typeof roadmapDisplaySchema>;

/** Public site defaults. */
export const defaultDisplay: RoadmapDisplaySettings = {
  showTitle: true,
  showSummary: true,
  showTags: true,
  showAttachments: false,
  showVotes: true,
  showObjectives: true,
  showDescriptions: true,
  showFeatures: true,
  showFeatureProgress: true,
  showDates: false,
  showImageHeaders: true,
  showCompleted: true,
};

/** Dashboard defaults: the team sees everything (doc 24 R2). */
export const defaultInternalDisplay: RoadmapDisplaySettings = {
  showTitle: true,
  showSummary: false,
  showTags: true,
  showAttachments: true,
  showVotes: true,
  showObjectives: true,
  showDescriptions: true,
  showFeatures: true,
  showFeatureProgress: true,
  showDates: true,
  showImageHeaders: true,
  showCompleted: true,
};

export const createRoadmapSchema = z.object({
  title: z.string().trim().min(2, "At least 2 characters").max(80),
});

const richText = z
  .record(z.string(), z.unknown())
  .refine((v) => v.type === "doc", "Invalid content")
  .refine((v) => JSON.stringify(v).length <= 100_000, "Too long");

/**
 * Everything in the Edit roadmap modal, saved at once (doc 24 R1).
 * `columns` is the full, ordered list: rows without an id are created,
 * existing columns missing from it are deleted.
 */
export const roadmapSettingsSchema = z.object({
  id,
  internalTitle: z.string().trim().min(2, "At least 2 characters").max(80),
  publicTitle: optionalText(80),
  internalSummaryJson: richText.nullable(),
  publicSummaryJson: richText.nullable(),
  isPublic: z.boolean(),
  notifyOnComplete: z.boolean(),
  display: roadmapDisplaySchema,
  internalDisplay: roadmapDisplaySchema,
  columns: z
    .array(
      z.object({
        id: id.optional(),
        name: z.string().trim().min(1, "Name every column").max(40),
        isPublic: z.boolean(),
        isDone: z.boolean(),
      }),
    )
    .min(1, "Keep at least one column")
    .max(12, "At most 12 columns"),
});

export type RoadmapSettingsInput = z.input<typeof roadmapSettingsSchema>;

export const roadmapIdSchema = z.object({ id });

export const moveColumnSchema = z.object({
  id,
  prevId: neighbour,
  nextId: neighbour,
});

export const createCardSchema = z.object({
  roadmapId: id,
  columnId: id,
  title: z.string().trim().min(1, "Enter a title").max(200),
});

/** Autosave patch: only the fields that changed are sent. */
export const updateCardSchema = z.object({
  id,
  title: z.string().trim().min(1, "Enter a title").max(200).optional(),
  publicTitle: optionalText(200).optional(),
  summaryJson: richText.nullable().optional(),
  objectiveId: id.nullable().optional(),
  plannedFor: z.iso.date().nullable().optional(),
  isPublic: z.boolean().optional(),
  tagIds: z.array(id).max(20).optional(),
});

export type UpdateCardInput = z.input<typeof updateCardSchema>;

export const moveCardSchema = z.object({
  id,
  columnId: id,
  prevId: neighbour,
  nextId: neighbour,
});

/** Move a card to (or copy it into) a column, possibly on another roadmap. */
export const transferCardSchema = z.object({
  id,
  columnId: id,
  mode: z.enum(["move", "copy"]),
});

export const cardIdSchema = z.object({ id });
export const cardFlagSchema = z.object({ id, value: z.boolean() });

export const createFeatureSchema = z.object({
  cardId: id,
  title: z.string().trim().min(1, "Enter a title").max(200),
});

export const updateFeatureSchema = z.object({
  id,
  title: z.string().trim().min(1, "Enter a title").max(200).optional(),
  done: z.boolean().optional(),
});

export const objectiveSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour"),
});

export const updateObjectiveSchema = objectiveSchema.extend({ id });

export const tagSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40),
});

export const boardFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  objectiveId: id.optional(),
  tagId: id.optional(),
  visibility: z.enum(["all", "public", "private"]).default("all"),
  showCompleted: z.boolean().default(true),
});

export type BoardFilter = z.input<typeof boardFilterSchema>;

// ── Card attachments, comments, follows (doc 21 step C) ───────────────────

export const requestAttachmentSchema = z.object({
  cardId: id,
  contentType: z.enum(
    Object.keys(ATTACHMENT_TYPES) as [AttachmentType, ...AttachmentType[]],
    "Attach an image (PNG, JPEG, WebP) or a PDF.",
  ),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_ATTACHMENT_BYTES, "Files must be 10 MB or smaller."),
});

export const addAttachmentSchema = z.object({
  cardId: id,
  key: z.string().max(300),
  name: z.string().trim().min(1).max(200),
});
