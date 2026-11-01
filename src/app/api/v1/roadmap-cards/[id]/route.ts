import { apiOptions, apiRoute, found, idParam } from "@/server/api/handler";
import { updateCardBody } from "@/server/api/write-schemas";
import { apiDeleteCard, apiUpdateCard } from "@/server/api/writes";
import { db } from "@/server/db/client";
import { apiCards } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

export const GET = apiRoute<{ id: string }>({}, async ({ caller, params }) => {
  const id = idParam(params.id, "Card");
  const page = await apiCards(db, caller.ctx.accountId, { limit: 1 }, id);
  return { data: found(page.data[0], "Card") };
});

/** Change only the fields sent (read + write key). */
export const PATCH = apiRoute<{ id: string }>(
  { write: true },
  async ({ caller, params, body }) => {
    const id = idParam(params.id, "Card");
    await apiUpdateCard(db, caller.ctx, id, await body(updateCardBody));
    const page = await apiCards(db, caller.ctx.accountId, { limit: 1 }, id);
    return { data: found(page.data[0], "Card") };
  },
);

export const DELETE = apiRoute<{ id: string }>(
  { write: true },
  async ({ caller, params }) => {
    await apiDeleteCard(db, caller.ctx, idParam(params.id, "Card"));
    return null;
  },
);
