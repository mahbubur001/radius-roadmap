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
  objectiveId: id.nullable().optional(),
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
  objectiveId: id.optional(),
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
  /** "pending" = the triage inbox (doc 20 D2). */
  review: z.enum(["all", "pending"]).default("all"),
});

export type FeedbackFilter = z.input<typeof feedbackFilterSchema>;

const ids = z.array(id).min(1).max(200);

export const REVIEW_ACTIONS = {
  approve: "Approve",
  keep_private: "Keep private",
  reject: "Reject",
} as const;
export type ReviewAction = keyof typeof REVIEW_ACTIONS;

/** Triage: approve (publish), keep private (approved, team only), reject (archive). */
export const reviewFeedbackSchema = z.object({
  ids,
  action: z.enum(
    Object.keys(REVIEW_ACTIONS) as [ReviewAction, ...ReviewAction[]],
  ),
});

/** Bulk edit from the inbox or the list. Tags are added, not replaced. */
export const bulkUpdateFeedbackSchema = z.object({
  ids,
  statusId: id.optional(),
  objectiveId: id.nullable().optional(),
  addTagIds: z.array(id).max(20).optional(),
});

// ── Boards and statuses (admin+) ────────────────────────────────────────

export const STATUS_KINDS = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done (completes the item)",
  declined: "Declined",
} as const;
export type StatusKind = keyof typeof STATUS_KINDS;

const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour");

export const createBoardSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(60),
});

export const updateBoardSchema = z.object({
  id,
  name: z.string().trim().min(2, "At least 2 characters").max(60),
  slug: z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(48)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Lowercase letters, numbers and dashes",
    ),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .nullable(),
  isPublic: z.boolean(),
  autoPublish: z.boolean(),
});

export const statusSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40),
  color,
  kind: z.enum(Object.keys(STATUS_KINDS) as [StatusKind, ...StatusKind[]]),
});

export const updateStatusSchema = statusSchema.extend({ id });

export const moveStatusSchema = z.object({
  id,
  prevId: id.nullable(),
  nextId: id.nullable(),
});

// ── Roadmap links, merge, duplicate (doc 20 §1) ─────────────────────────

/** Creates a card in `columnId` from the feedback and links the two. */
export const pushToRoadmapSchema = z.object({
  feedbackId: id,
  columnId: id,
  title: z.string().trim().min(1, "Enter a title").max(200),
});

export const linkCardSchema = z.object({ feedbackId: id, cardId: id });

/** `sourceId` is folded into `targetId` (votes, followers, comments, links). */
export const mergeFeedbackSchema = z.object({ sourceId: id, targetId: id });

/** Actions that only need the workspace. */
export const noInputSchema = z.looseObject({});

export const pickerSearchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  /** Leave this item out of the results (merge picker). */
  excludeId: id.optional(),
});

/** Public "Add new" idea form (doc 20 §4.2, doc 22 step 4). */
export const submitIdeaSchema = z.object({
  workspaceId: z.uuid(),
  board: z.string().trim().min(1).max(80),
  title: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(200, "Keep the title under 200 characters"),
  details: z.string().trim().max(5000, "Keep it under 5000 characters"),
  acceptTerms: z.boolean().optional(),
  turnstileToken: z.string().max(4096).optional(),
});

export type SubmitIdeaInput = z.input<typeof submitIdeaSchema>;

/**
 * The public idea form as the visitor fills it in. Name and email are only
 * asked (and required) when nobody is logged in; the server re-checks the
 * idea with submitIdeaSchema and the guest with guestSignInSchema.
 */
export const ideaFormSchema = z.object({
  title: submitIdeaSchema.shape.title,
  details: submitIdeaSchema.shape.details,
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().max(254).optional(),
  acceptTerms: z.boolean().optional(),
});

export type IdeaFormInput = z.infer<typeof ideaFormSchema>;
