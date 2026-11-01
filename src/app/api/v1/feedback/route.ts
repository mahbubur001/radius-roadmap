import { apiOptions, apiRoute } from "@/server/api/handler";
import { feedbackListQuery } from "@/server/api/schemas";
import { createFeedbackBody } from "@/server/api/write-schemas";
import { apiCreateFeedback } from "@/server/api/writes";
import { db } from "@/server/db/client";
import { apiFeedback } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

/** List, newest first (`limit`, `cursor`; see openapi.json for filters). */
export const GET = apiRoute({}, async ({ caller, query }) => {
  const page = await apiFeedback(
    db,
    caller.ctx.accountId,
    query(feedbackListQuery),
  );
  return { data: page.data, nextCursor: page.nextCursor };
});

/** Create (read + write key). Returns the new item. */
export const POST = apiRoute(
  { write: true, status: 201 },
  async ({ caller, body }) => {
    const id = await apiCreateFeedback(
      db,
      caller.ctx,
      await body(createFeedbackBody),
    );
    const page = await apiFeedback(db, caller.ctx.accountId, { limit: 1 }, id);
    return { data: page.data[0] };
  },
);
