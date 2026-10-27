"use server";

import { headers } from "next/headers";
import {
  switchAccountSchema,
  updateAccountSchema,
} from "@/lib/schemas/account";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceIdSchema,
} from "@/lib/schemas/workspace";
import { action } from "@/server/action";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { invalidateSite } from "@/server/public-cache";
import { updateAccount } from "@/server/services/accounts";
import {
  createWorkspace,
  deleteWorkspace,
  updateWorkspace,
} from "@/server/services/workspaces";
import { requireAccount } from "@/server/session";

export const createWorkspaceAction = action(
  createWorkspaceSchema,
  async (input) => {
    const ctx = await requireAccount();
    const ws = await createWorkspace(db, ctx, input);
    invalidateSite(ctx.accountId);
    return { slug: ws.slug };
  },
);

export const updateWorkspaceAction = action(
  updateWorkspaceSchema.extend(workspaceIdSchema.shape),
  async ({ id, ...input }) => {
    const ctx = await requireAccount();
    const ws = await updateWorkspace(db, ctx, id, input);
    invalidateSite(ctx.accountId);
    return { slug: ws.slug };
  },
);

export const deleteWorkspaceAction = action(
  workspaceIdSchema,
  async ({ id }) => {
    const ctx = await requireAccount();
    await deleteWorkspace(db, ctx, id);
    invalidateSite(ctx.accountId);
  },
);

export const updateAccountAction = action(
  updateAccountSchema,
  async (input) => {
    const ctx = await requireAccount();
    await updateAccount(db, ctx, input);
    invalidateSite(ctx.accountId);
  },
);

/** Better Auth checks membership before switching the active account. */
export const switchAccountAction = action(
  switchAccountSchema,
  async ({ accountId }) => {
    await auth.api.setActiveOrganization({
      headers: await headers(),
      body: { organizationId: accountId },
    });
  },
);
