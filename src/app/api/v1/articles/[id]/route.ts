import { apiOptions, apiRoute, found, idParam } from "@/server/api/handler";
import { db } from "@/server/db/client";
import { apiArticles } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

export const GET = apiRoute<{ id: string }>({}, async ({ caller, params }) => {
  const id = idParam(params.id, "Article");
  const page = await apiArticles(db, caller.ctx.accountId, { limit: 1 }, id);
  return { data: found(page.data[0], "Article") };
});
