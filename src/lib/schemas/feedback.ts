import { z } from "zod";

const id = z.uuid();

const richText = z
  .record(z.string(), z.unknown())
  .refine((v) => v.type === "doc", "Invalid content")
  .refine((v) => JSON.stringify(v).length <= 100_000, "Too long");

/** XS–XL, stored as 1–5 (doc 03). */
export const SIZES = ["XS", "S", "M", "L", "XL"] as const;
const size = z.number().int().min(1).max(5);

/**
 * Priority score = impact + inverted effort, 2–10 (LoopedIn's formula,
 * doc 03): high impact and low effort score highest.
 */
export function priorityScore(
  impact: number | null | undefined,
  effort: number | null | undefined,
) {
  return impact && effort ? impact + (6 - effort) : null;
}

export const PRIORITY_BUCKETS = {
  quick_wins: { label: "Quick wins", min: 8, max: 10 },
  maybe: { label: "Maybe", min: 5, max: 7 },
  time_sinks: { label: "Time sinks", min: 2, max: 4 },
} as const;
export type PriorityBucket = keyof typeof PRIORITY_BUCKETS;

export function priorityBucket(score: number | null): PriorityBucket | null {
  if (score === null) return null;
  for (const [key, b] of Object.entries(PRIORITY_BUCKETS)) {
    if (score >= b.min && score <= b.max) return key as PriorityBucket;
  }
  return null;
}

export const createFeedbackSchema = z.object({
  boardId: id,
  title: z.string().trim().min(1, "Enter a title").max(200),
});

/** Autosave patch: only the fields that changed are sent. */
export const updateFeedbackSchema = z.object({
  id,
  title: z.string().trim().min(1, "Enter a title").max(200).optional(),
  summaryJson: richText.nullable().optional(),
  boardId: id.optional(),
  statusId: id.optional(),
  categoryId: id.nullable().optional(),
  isPublic: z.boolean().optional(),
  impact: size.nullable().optional(),
  effort: size.nullable().optional(),
  tagIds: z.array(id).max(20).optional(),
});

export type UpdateFeedbackInput = z.input<typeof updateFeedbackSchema>;

export const feedbackIdSchema = z.object({ id });
export const feedbackFlagSchema = z.object({ id, value: z.boolean() });

export const FEEDBACK_SORTS = {
  votes: "Most votes",
  newest: "Newest",
  oldest: "Oldest",
  updated: "Recently updated",
  priority: "Priority",
} as const;
export type FeedbackSort = keyof typeof FEEDBACK_SORTS;

/** Admin list filters. Also parsed from the page's search params. */
export const feedbackFilterSchema = z.object({
  boardId: id.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z
    .enum(Object.keys(FEEDBACK_SORTS) as [FeedbackSort, ...FeedbackSort[]])
    .default("votes"),
  statusId: id.optional(),
  categoryId: id.optional(),
  tagId: id.optional(),
  visibility: z.enum(["all", "public", "private"]).default("all"),
  linked: z.enum(["all", "linked", "unlinked"]).default("all"),
  priority: z
    .enum([
      "all",
      "none",
      ...(Object.keys(PRIORITY_BUCKETS) as PriorityBucket[]),
    ])
    .default("all"),
  state: z.enum(["open", "completed", "archived", "all"]).default("open"),
});

export type FeedbackFilter = z.input<typeof feedbackFilterSchema>;
