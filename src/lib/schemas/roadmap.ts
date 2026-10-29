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
  showVotes: z.boolean(),
  showObjectives: z.boolean(),
  showTags: z.boolean(),
  showDates: z.boolean(),
  showDescriptions: z.boolean(),
  showCompleted: z.boolean(),
  showFeatures: z.boolean(),
});

export type RoadmapDisplaySettings = z.infer<typeof roadmapDisplaySchema>;

export const defaultDisplay: RoadmapDisplaySettings = {
  showVotes: true,
  showObjectives: true,
  showTags: true,
  showDates: false,
  showDescriptions: true,
  showCompleted: true,
  showFeatures: true,
};

export const createRoadmapSchema = z.object({
  title: z.string().trim().min(2, "At least 2 characters").max(80),
});

export const updateRoadmapSchema = z.object({
  id,
  internalTitle: z.string().trim().min(2, "At least 2 characters").max(80),
  publicTitle: optionalText(80),
  internalSummary: optionalText(500),
  publicSummary: optionalText(500),
  isPublic: z.boolean(),
  display: roadmapDisplaySchema,
});

export type UpdateRoadmapInput = z.input<typeof updateRoadmapSchema>;

export const roadmapIdSchema = z.object({ id });

export const createColumnSchema = z.object({
  roadmapId: id,
  name: z.string().trim().min(1, "Enter a name").max(40),
});

export const updateColumnSchema = z.object({
  id,
  name: z.string().trim().min(1, "Enter a name").max(40),
  isPublic: z.boolean(),
  isDone: z.boolean(),
});

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

const richText = z
  .record(z.string(), z.unknown())
  .refine((v) => v.type === "doc", "Invalid content")
  .refine((v) => JSON.stringify(v).length <= 100_000, "Too long");

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

const commentBody = z
  .string()
  .trim()
  .min(1, "Write a comment")
  .max(5000, "Keep it under 5000 characters");

export const cardCommentSchema = z.object({ cardId: id, body: commentBody });
export const updateCardCommentSchema = z.object({ id, body: commentBody });
