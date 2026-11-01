import { apiOptions, apiRoute } from "@/server/api/handler";
import { articleListQuery } from "@/server/api/schemas";
import { db } from "@/server/db/client";
import { apiArticles } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

/** List, newest first (`limit`, `cursor`; see openapi.json for filters). */
export const GET = apiRoute({}, async ({ caller, query }) => {
  const page = await apiArticles(
    db,
    caller.ctx.accountId,
    query(articleListQuery),
  );
  return { data: page.data, nextCursor: page.nextCursor };
});
