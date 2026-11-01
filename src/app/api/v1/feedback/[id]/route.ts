import { apiOptions, apiRoute, found, idParam } from "@/server/api/handler";
import { updateFeedbackBody } from "@/server/api/write-schemas";
import { apiDeleteFeedback, apiUpdateFeedback } from "@/server/api/writes";
import { db } from "@/server/db/client";
import { apiFeedback } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

export const GET = apiRoute<{ id: string }>({}, async ({ caller, params }) => {
  const id = idParam(params.id, "Feedback");
  const page = await apiFeedback(db, caller.ctx.accountId, { limit: 1 }, id);
  return { data: found(page.data[0], "Feedback") };
});

/** Change only the fields sent (read + write key). */
export const PATCH = apiRoute<{ id: string }>(
  { write: true },
  async ({ caller, params, body }) => {
    const id = idParam(params.id, "Feedback");
    await apiUpdateFeedback(db, caller.ctx, id, await body(updateFeedbackBody));
    const page = await apiFeedback(db, caller.ctx.accountId, { limit: 1 }, id);
    return { data: found(page.data[0], "Feedback") };
  },
);

export const DELETE = apiRoute<{ id: string }>(
  { write: true },
  async ({ caller, params }) => {
    await apiDeleteFeedback(db, caller.ctx, idParam(params.id, "Feedback"));
    return null;
  },
);
