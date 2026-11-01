import { z } from "zod";
import {
  articleListQuery,
  cardListQuery,
  feedbackListQuery,
  listQuery,
  updateListQuery,
  workspaceListQuery,
} from "./schemas";
import { writeOperations } from "./write-schemas";

// OpenAPI 3.1 document for /api/v1 (doc 27 A7), generated from the Zod
// schemas the routes and tests use.

type Operation = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const errors = Object.fromEntries(
  [
    ["401", "Missing, invalid or revoked key"],
    ["403", "Read-only key, or the plan doesn't include this"],
    ["404", "Not found in this account"],
    ["429", "Rate limit: 100 requests a minute per key"],
  ].map(([code, description]) => [
    code,
    {
      description,
      content: { "application/json": { schema: ref("Error") } },
    },
  ]),
);

/** Query parameters of a list endpoint, from its Zod schema. */
function queryParams(schema: z.ZodObject) {
  const json = z.toJSONSchema(schema, { io: "input" }) as {
    properties: Record<string, object>;
  };
  return Object.entries(json.properties).map(([name, s]) => ({
    name,
    in: "query",
    required: false,
    schema: s,
  }));
}

function list(tag: string, item: string, schema: z.ZodObject): Operation {
  return {
    get: {
      tags: [tag],
      summary: `List ${tag.toLowerCase()}`,
      parameters: queryParams(schema),
      responses: {
        "200": {
          description:
            "A page, newest first. Pass `next_cursor` as `cursor` for the next one.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["data", "next_cursor"],
                properties: {
                  data: { type: "array", items: ref(item) },
                  next_cursor: { type: ["string", "null"] },
                },
              },
            },
          },
        },
        ...errors,
      },
    },
  };
}

function one(tag: string, item: string): Operation {
  return {
    get: {
      tags: [tag],
      summary: `Get one ${item}`,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        "200": {
          description: item,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["data"],
                properties: { data: ref(item) },
              },
            },
          },
        },
        ...errors,
      },
    },
  };
}

/** Merge operations on the same path. */
function merge(...ops: Operation[]): Operation {
  return Object.assign({}, ...ops);
}

export function openApiDocument(origin: string) {
  // Every schema with `.meta({ id })` (schemas.ts, write-schemas.ts)
  // becomes a component; references between them point there.
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    uri: (id) => `#/components/schemas/${id}`,
  });
  const components = Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => {
      const {
        $schema: _,
        $id: __,
        ...rest
      } = schema as Record<string, unknown>;
      return [name, rest];
    }),
  );

  const write = writeOperations.paths(ref, errors);
  return {
    openapi: "3.1.0",
    info: {
      title: "Radius Roadmap API",
      version: "1.0.0",
      description:
        "REST API for one account: workspaces, roadmaps, cards, feedback, updates and articles. Send your key as `Authorization: Bearer <key>` (Settings → API). Responses are snake_case JSON; lists are cursor-paginated.",
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas: components,
    },
    paths: {
      "/account": {
        get: {
          tags: ["Account"],
          summary: "The key's account",
          responses: {
            "200": {
              description: "Account",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: ref("Account") },
                  },
                },
              },
            },
            ...errors,
          },
        },
      },
      "/workspaces": list("Workspaces", "Workspace", listQuery),
      "/workspaces/{id}": one("Workspaces", "Workspace"),
      "/roadmaps": list("Roadmaps", "Roadmap", workspaceListQuery),
      "/roadmaps/{id}": one("Roadmaps", "Roadmap"),
      "/objectives": list("Objectives", "Objective", workspaceListQuery),
      "/roadmap-cards": merge(
        list("Roadmap cards", "RoadmapCard", cardListQuery),
        write["/roadmap-cards"] ?? {},
      ),
      "/roadmap-cards/{id}": merge(
        one("Roadmap cards", "RoadmapCard"),
        write["/roadmap-cards/{id}"] ?? {},
      ),
      "/feedback-boards": list(
        "Feedback boards",
        "FeedbackBoard",
        workspaceListQuery,
      ),
      "/feedback-statuses": list(
        "Feedback statuses",
        "FeedbackStatus",
        workspaceListQuery,
      ),
      "/feedback": merge(
        list("Feedback", "Feedback", feedbackListQuery),
        write["/feedback"] ?? {},
      ),
      "/feedback/{id}": merge(
        one("Feedback", "Feedback"),
        write["/feedback/{id}"] ?? {},
      ),
      "/updates": merge(
        list("Updates", "Update", updateListQuery),
        write["/updates"] ?? {},
      ),
      "/updates/{id}": merge(
        one("Updates", "Update"),
        write["/updates/{id}"] ?? {},
      ),
      "/articles": list("Articles", "Article", articleListQuery),
      "/articles/{id}": one("Articles", "Article"),
    },
  };
}
