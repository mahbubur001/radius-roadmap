import { apiOptions, apiRoute } from "@/server/api/handler";
import { updateListQuery } from "@/server/api/schemas";
import { createUpdateBody } from "@/server/api/write-schemas";
import { apiCreateUpdate } from "@/server/api/writes";
import { db } from "@/server/db/client";
import { apiUpdates } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

/** List, newest first (`limit`, `cursor`; see openapi.json for filters). */
export const GET = apiRoute({}, async ({ caller, query }) => {
  const page = await apiUpdates(
    db,
    caller.ctx.accountId,
    query(updateListQuery),
  );
  return { data: page.data, nextCursor: page.nextCursor };
});

/** Create (read + write key). Returns the new item. */
export const POST = apiRoute(
  { write: true, status: 201 },
  async ({ caller, body }) => {
    const id = await apiCreateUpdate(
      db,
      caller.ctx,
      await body(createUpdateBody),
    );
    const page = await apiUpdates(db, caller.ctx.accountId, { limit: 1 }, id);
    return { data: page.data[0] };
  },
);
