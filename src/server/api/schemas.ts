import { z } from "zod";

// Shapes of the public REST API v1 (doc 27 A5, A6), snake_case. The
// OpenAPI document is generated from these, and the tests check responses
// against them, so the two can't drift apart.

const id = z.uuid();
const date = z.iso.datetime({ offset: true });
const url = z.url();

export const accountSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    plan: z.enum(["free", "startup", "pro", "enterprise"]),
    public_url: url,
    created_at: date,
  })
  .meta({ id: "Account" });

export const workspaceSchema = z
  .object({
    id,
    name: z.string(),
    slug: z.string(),
    public_url: url,
    created_at: date,
  })
  .meta({ id: "Workspace" });

export const columnSchema = z
  .object({
    id,
    name: z.string(),
    is_public: z.boolean(),
    is_done: z.boolean(),
  })
  .meta({ id: "Column" });

export const roadmapSchema = z
  .object({
    id,
    workspace_id: id,
    slug: z.string(),
    title: z.string(),
    public_title: z.string().nullable(),
    is_public: z.boolean(),
    columns: z.array(columnSchema),
    created_at: date,
    updated_at: date,
  })
  .meta({ id: "Roadmap" });

export const objectiveSchema = z
  .object({ id, workspace_id: id, name: z.string(), color: z.string() })
  .meta({ id: "Objective" });

export const cardSchema = z
  .object({
    id,
    workspace_id: id,
    roadmap_id: id,
    column_id: id,
    slug: z.string(),
    title: z.string(),
    public_title: z.string().nullable(),
    description: z.string().describe("Plain text."),
    description_html: z.string().optional().describe("Only on GET one card."),
    objective_id: id.nullable(),
    planned_for: z.iso.date().nullable(),
    is_public: z.boolean(),
    votes: z.int(),
    completed: z.boolean(),
    completed_at: date.nullable(),
    archived: z.boolean(),
    public_url: url.nullable(),
    created_at: date,
    updated_at: date,
  })
  .meta({ id: "RoadmapCard" });

export const boardSchema = z
  .object({
    id,
    workspace_id: id,
    slug: z.string(),
    name: z.string(),
    is_public: z.boolean(),
    created_at: date,
  })
  .meta({ id: "FeedbackBoard" });

export const statusSchema = z
  .object({
    id,
    workspace_id: id,
    name: z.string(),
    color: z.string(),
    kind: z.string(),
  })
  .meta({ id: "FeedbackStatus" });

export const feedbackSchema = z
  .object({
    id,
    workspace_id: id,
    board_id: id,
    status_id: id.nullable(),
    slug: z.string(),
    title: z.string(),
    details: z.string().describe("Plain text."),
    details_html: z.string().optional().describe("Only on GET one item."),
    objective_id: id.nullable(),
    is_public: z.boolean(),
    review: z.enum(["pending", "approved", "rejected"]),
    votes: z.int(),
    comments: z.int(),
    author: z
      .object({ name: z.string().nullable(), email: z.string().nullable() })
      .nullable(),
    source: z.string(),
    completed_at: date.nullable(),
    archived_at: date.nullable(),
    public_url: url.nullable(),
    created_at: date,
    updated_at: date,
  })
  .meta({ id: "Feedback" });

export const updateSchema = z
  .object({
    id,
    workspace_id: id,
    slug: z.string(),
    title: z.string(),
    status: z.enum(["draft", "scheduled", "published"]),
    is_public: z.boolean(),
    pinned: z.boolean(),
    category: z.object({ name: z.string(), color: z.string() }).nullable(),
    excerpt: z.string().describe("Plain text, first 300 characters."),
    content_html: z.string().optional().describe("Only on GET one update."),
    publish_at: date.nullable(),
    published_at: date.nullable(),
    public_url: url.nullable(),
    created_at: date,
    updated_at: date,
  })
  .meta({ id: "Update" });

export const articleSchema = z
  .object({
    id,
    workspace_id: id,
    category_id: id.nullable(),
    slug: z.string(),
    title: z.string(),
    excerpt: z.string().nullable(),
    content_html: z.string().optional().describe("Only on GET one article."),
    status: z.enum(["draft", "published"]),
    is_public: z.boolean(),
    featured: z.boolean(),
    published_at: date.nullable(),
    public_url: url.nullable(),
    created_at: date,
    updated_at: date,
  })
  .meta({ id: "Article" });

export const errorSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "unauthorized",
        "forbidden",
        "not_found",
        "conflict",
        "invalid_request",
        "rate_limited",
        "server_error",
      ]),
      message: z.string(),
    }),
  })
  .meta({ id: "Error" });

// Query parameters

const cursor = z.string().max(200).optional();
const limit = z.coerce.number().int().min(1).max(100).default(25);
const flag = z.enum(["true", "false"]).optional();

export const listQuery = z.object({ limit, cursor });
export const workspaceListQuery = listQuery.extend({
  workspace_id: id.optional(),
});
export const cardListQuery = workspaceListQuery.extend({
  roadmap_id: id.optional(),
  column_id: id.optional(),
  objective_id: id.optional(),
  completed: flag,
  archived: flag,
  public: flag,
  q: z.string().trim().max(100).optional(),
});
export const feedbackListQuery = workspaceListQuery.extend({
  board_id: id.optional(),
  status_id: id.optional(),
  review: z.enum(["pending", "approved", "rejected"]).optional(),
  completed: flag,
  archived: flag,
  q: z.string().trim().max(100).optional(),
});
export const updateListQuery = workspaceListQuery.extend({
  status: z.enum(["draft", "scheduled", "published"]).optional(),
});
export const articleListQuery = workspaceListQuery.extend({
  status: z.enum(["draft", "published"]).optional(),
});

export type CardListQuery = z.infer<typeof cardListQuery>;
export type FeedbackListQuery = z.infer<typeof feedbackListQuery>;
export type UpdateListQuery = z.infer<typeof updateListQuery>;
export type ArticleListQuery = z.infer<typeof articleListQuery>;
export type WorkspaceListQuery = z.infer<typeof workspaceListQuery>;

/** `{ data, next_cursor }` for a list of `item`. */
export function listOf<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), next_cursor: z.string().nullable() });
}

export function one<T extends z.ZodType>(item: T) {
  return z.object({ data: item });
}
