import { apiOptions, apiRoute, found } from "@/server/api/handler";
import { db } from "@/server/db/client";
import { apiAccount } from "@/server/services/api-read";

export const OPTIONS = apiOptions;

/** The account the key belongs to. */
export const GET = apiRoute({}, async ({ caller }) => ({
  data: found(await apiAccount(db, caller.ctx.accountId), "Account"),
}));
