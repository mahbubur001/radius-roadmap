import { apiOptions, apiRoute } from "@/server/api/handler";
import { workspaceListQuery } from "@/server/api/schemas";
import { db } from "@/server/db/client";
import { apiRoadmaps } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

/** List, newest first (`limit`, `cursor`; see openapi.json for filters). */
export const GET = apiRoute({}, async ({ caller, query }) => {
  const page = await apiRoadmaps(
    db,
    caller.ctx.accountId,
    query(workspaceListQuery),
  );
  return { data: page.data, nextCursor: page.nextCursor };
});
