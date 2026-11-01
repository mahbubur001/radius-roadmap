"use server";

import { z } from "zod";
import { createApiKeySchema } from "@/lib/schemas/api-keys";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { createApiKey, revokeApiKey } from "@/server/services/api-keys";

// Settings → API (doc 27). The new key is returned once, to show it.

export const createApiKeyAction = workspaceAction(
  createApiKeySchema,
  (ctx, input) => createApiKey(db, ctx, input),
);

export const revokeApiKeyAction = workspaceAction(
  z.object({ id: z.uuid() }),
  (ctx, { id }) => revokeApiKey(db, ctx, id),
);
