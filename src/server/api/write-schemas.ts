import { z } from "zod";

// Request bodies of the API's write endpoints (doc 27 A6), snake_case, and
// their OpenAPI path entries. Text fields are plain text; line breaks become
// paragraphs.

const id = z.uuid();
const text = (max: number) => z.string().trim().max(max);

export const createCardBody = z
  .object({
    roadmap_id: id,
    column_id: id,
    title: text(200).min(1),
    public_title: text(200).nullable().optional(),
    description: text(20_000).optional(),
    objective_id: id.nullable().optional(),
    planned_for: z.iso.date().nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .meta({ id: "CreateRoadmapCard" });

export const updateCardBody = z
  .object({
    title: text(200).min(1).optional(),
    public_title: text(200).nullable().optional(),
    description: text(20_000).optional(),
    objective_id: id.nullable().optional(),
    planned_for: z.iso.date().nullable().optional(),
    is_public: z.boolean().optional(),
    column_id: id
      .optional()
      .describe("Moves the card to the end of this column (same roadmap)."),
    completed: z.boolean().optional(),
  })
  .meta({ id: "UpdateRoadmapCard" });

export const createFeedbackBody = z
  .object({
    board_id: id,
    title: text(200).min(1),
    details: text(20_000).optional(),
    status_id: id.optional(),
    objective_id: id.nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .meta({ id: "CreateFeedback" });

export const updateFeedbackBody = z
  .object({
    title: text(200).min(1).optional(),
    details: text(20_000).optional(),
    board_id: id.optional(),
    status_id: id.optional(),
    objective_id: id.nullable().optional(),
    is_public: z.boolean().optional(),
    completed: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .meta({ id: "UpdateFeedback" });

export const createUpdateBody = z
  .object({
    workspace_id: id,
    title: text(200).min(1),
    content: text(50_000).optional(),
    category_id: id.nullable().optional(),
    is_public: z.boolean().optional(),
    pinned: z.boolean().optional(),
    email_subscribers: z
      .boolean()
      .optional()
      .describe("Email the post to subscribers when it's published."),
  })
  .meta({ id: "CreateUpdate" });

export const updateUpdateBody = z
  .object({
    title: text(200).min(1).optional(),
    content: text(50_000).optional(),
    category_id: id.nullable().optional(),
    is_public: z.boolean().optional(),
    pinned: z.boolean().optional(),
    email_subscribers: z.boolean().optional(),
    status: z
      .enum(["draft", "published"])
      .optional()
      .describe(
        "`published` publishes now, or at `publish_at` when it's in the future; `draft` unpublishes.",
      ),
    publish_at: z.iso.datetime({ offset: true }).optional(),
  })
  .meta({ id: "UpdateUpdate" });

type Ref = (name: string) => { $ref: string };

function body(name: string) {
  return (ref: Ref) => ({
    required: true,
    content: { "application/json": { schema: ref(name) } },
  });
}

const idParam = [
  {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
];

function returns(ref: Ref, item: string, status = "200") {
  return {
    [status]: {
      description: item,
      content: {
        "application/json": {
          schema: { type: "object", properties: { data: ref(item) } },
        },
      },
    },
  };
}

/** Write operations for openapi.ts (merged into the read paths). */
export const writeOperations = {
  schemas: {
    CreateRoadmapCard: createCardBody,
    UpdateRoadmapCard: updateCardBody,
    CreateFeedback: createFeedbackBody,
    UpdateFeedback: updateFeedbackBody,
    CreateUpdate: createUpdateBody,
    UpdateUpdate: updateUpdateBody,
  },
  paths(ref: Ref, errors: Record<string, unknown>) {
    const write = (
      tag: string,
      item: string,
      create: string,
      update: string,
    ) => ({
      collection: {
        post: {
          tags: [tag],
          summary: `Create ${item}`,
          description: "Needs a read + write key.",
          requestBody: body(create)(ref),
          responses: { ...returns(ref, item, "201"), ...errors },
        },
      },
      item: {
        patch: {
          tags: [tag],
          summary: `Update ${item}`,
          description:
            "Only the fields you send change. Needs a read + write key.",
          parameters: idParam,
          requestBody: body(update)(ref),
          responses: { ...returns(ref, item), ...errors },
        },
        delete: {
          tags: [tag],
          summary: `Delete ${item}`,
          description: "Needs a read + write key.",
          parameters: idParam,
          responses: { "204": { description: "Deleted" }, ...errors },
        },
      },
    });
    const cards = write(
      "Roadmap cards",
      "RoadmapCard",
      "CreateRoadmapCard",
      "UpdateRoadmapCard",
    );
    const feedback = write(
      "Feedback",
      "Feedback",
      "CreateFeedback",
      "UpdateFeedback",
    );
    const posts = write("Updates", "Update", "CreateUpdate", "UpdateUpdate");
    return {
      "/roadmap-cards": cards.collection,
      "/roadmap-cards/{id}": cards.item,
      "/feedback": feedback.collection,
      "/feedback/{id}": feedback.item,
      "/updates": posts.collection,
      "/updates/{id}": posts.item,
    } as Record<string, Record<string, unknown>>;
  },
};
