import { apiOptions, apiRoute } from "@/server/api/handler";
import { listQuery } from "@/server/api/schemas";
import { db } from "@/server/db/client";
import { apiWorkspaces } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

/** List, newest first (`limit`, `cursor`; see openapi.json for filters). */
export const GET = apiRoute({}, async ({ caller, query }) => {
  const page = await apiWorkspaces(db, caller.ctx.accountId, query(listQuery));
  return { data: page.data, nextCursor: page.nextCursor };
});
