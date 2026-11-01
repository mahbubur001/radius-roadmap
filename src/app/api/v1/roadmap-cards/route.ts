import { apiOptions, apiRoute } from "@/server/api/handler";
import { cardListQuery } from "@/server/api/schemas";
import { createCardBody } from "@/server/api/write-schemas";
import { apiCreateCard } from "@/server/api/writes";
import { db } from "@/server/db/client";
import { apiCards } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

/** List, newest first (`limit`, `cursor`; see openapi.json for filters). */
export const GET = apiRoute({}, async ({ caller, query }) => {
  const page = await apiCards(db, caller.ctx.accountId, query(cardListQuery));
  return { data: page.data, nextCursor: page.nextCursor };
});

/** Create (read + write key). Returns the new item. */
export const POST = apiRoute(
  { write: true, status: 201 },
  async ({ caller, body }) => {
    const id = await apiCreateCard(db, caller.ctx, await body(createCardBody));
    const page = await apiCards(db, caller.ctx.accountId, { limit: 1 }, id);
    return { data: page.data[0] };
  },
);
