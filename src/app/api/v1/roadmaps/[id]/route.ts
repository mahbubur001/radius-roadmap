import { apiOptions, apiRoute, found, idParam } from "@/server/api/handler";
import { db } from "@/server/db/client";
import { apiRoadmaps } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

export const GET = apiRoute<{ id: string }>({}, async ({ caller, params }) => {
  const id = idParam(params.id, "Roadmap");
  const page = await apiRoadmaps(db, caller.ctx.accountId, { limit: 1 }, id);
  return { data: found(page.data[0], "Roadmap") };
});
