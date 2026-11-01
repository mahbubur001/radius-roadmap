import { apiOptions, apiRoute, found, idParam } from "@/server/api/handler";
import { updateUpdateBody } from "@/server/api/write-schemas";
import { apiDeleteUpdate, apiUpdateUpdate } from "@/server/api/writes";
import { db } from "@/server/db/client";
import { apiUpdates } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

export const GET = apiRoute<{ id: string }>({}, async ({ caller, params }) => {
  const id = idParam(params.id, "Update");
  const page = await apiUpdates(db, caller.ctx.accountId, { limit: 1 }, id);
  return { data: found(page.data[0], "Update") };
});

/** Change only the fields sent (read + write key). */
export const PATCH = apiRoute<{ id: string }>(
  { write: true },
  async ({ caller, params, body }) => {
    const id = idParam(params.id, "Update");
    await apiUpdateUpdate(db, caller.ctx, id, await body(updateUpdateBody));
    const page = await apiUpdates(db, caller.ctx.accountId, { limit: 1 }, id);
    return { data: found(page.data[0], "Update") };
  },
);

export const DELETE = apiRoute<{ id: string }>(
  { write: true },
  async ({ caller, params }) => {
    await apiDeleteUpdate(db, caller.ctx, idParam(params.id, "Update"));
    return null;
  },
);
