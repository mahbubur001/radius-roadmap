"use server";

import { brandingSchema } from "@/lib/schemas/branding";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidateSite } from "@/server/public-cache";
import { updateBranding } from "@/server/services/branding";

export const updateBrandingAction = workspaceAction(
  brandingSchema,
  async (ctx, input) => {
    await updateBranding(db, ctx, input);
    invalidateSite(ctx.accountId);
  },
);
