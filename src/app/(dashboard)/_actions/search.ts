"use server";

import { quickSearchSchema } from "@/lib/schemas/search";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { quickSearch } from "@/server/services/search";

export const quickSearchAction = workspaceAction(
  quickSearchSchema,
  (ctx, { q }) => quickSearch(db, ctx, q),
);
