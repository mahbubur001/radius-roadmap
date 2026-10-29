"use server";

import { notificationPrefsSchema } from "@/lib/schemas/notifications";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { setMyPrefs } from "@/server/services/notifications";

/** The caller's own email alerts for this workspace (doc 20 step 8). */
export const setNotificationPrefsAction = workspaceAction(
  notificationPrefsSchema,
  async (ctx, input) => setMyPrefs(db, ctx, input),
);
