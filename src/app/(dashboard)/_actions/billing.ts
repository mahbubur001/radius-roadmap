"use server";

import { z } from "zod";
import { env } from "@/lib/env";
import { checkoutSchema } from "@/lib/schemas/billing";
import { action, workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { openPortal, startCheckout } from "@/server/services/billing";
import { requireUser, requireWorkspace } from "@/server/session";

function billingUrl(workspaceSlug: string) {
  return new URL(
    `/dashboard/${workspaceSlug}/settings/billing`,
    env.NEXT_PUBLIC_APP_URL,
  ).href;
}

/** Returns the Stripe Checkout (or portal, when already paying) URL. */
export const checkoutAction = workspaceAction(
  checkoutSchema,
  async (ctx, input) => {
    const session = await requireUser();
    return startCheckout(db, ctx, {
      ...input,
      email: session.user.email,
      returnUrl: billingUrl(ctx.workspaceSlug),
    });
  },
);

export const portalAction = action(
  z.object({ workspace: z.string().min(1) }),
  async ({ workspace }) => {
    const ctx = await requireWorkspace(workspace);
    return openPortal(db, ctx, billingUrl(ctx.workspaceSlug));
  },
);
