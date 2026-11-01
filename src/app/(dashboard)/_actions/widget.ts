"use server";

import { z } from "zod";
import { widgetSettingsSchema } from "@/lib/schemas/widget";
import { action, workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import {
  getWidgetKey,
  rotateWidgetKey,
  updateWidgetSettings,
} from "@/server/services/widget";
import { requireWorkspace } from "@/server/session";

export const updateWidgetSettingsAction = workspaceAction(
  widgetSettingsSchema,
  async (ctx, input) => {
    await updateWidgetSettings(db, ctx, input);
    invalidatePublic(ctx.workspaceId);
  },
);

/** The signing key, fetched on demand so it isn't in the page's HTML. */
const workspaceOnly = z.object({ workspace: z.string().min(1) });

export const revealWidgetKeyAction = action(workspaceOnly, async (input) =>
  getWidgetKey(db, await requireWorkspace(input.workspace)),
);

export const rotateWidgetKeyAction = action(workspaceOnly, async (input) =>
  rotateWidgetKey(db, await requireWorkspace(input.workspace)),
);
