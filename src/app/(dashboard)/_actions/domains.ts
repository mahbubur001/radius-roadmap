"use server";

import { z } from "zod";
import { domainSchema } from "@/lib/schemas/domain";
import { action, workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidateSite } from "@/server/public-cache";
import {
  removeDomain,
  setDomain,
  verifyOwnDomain,
} from "@/server/services/custom-domains";
import { requireWorkspace } from "@/server/session";

// Settings → Domain (doc 26 6D). Links and canonical URLs on the public site
// depend on the domain, so every change drops the site cache.

export const setDomainAction = workspaceAction(
  domainSchema,
  async (ctx, input) => {
    await setDomain(db, ctx, input);
    invalidateSite(ctx.accountId);
  },
);

const workspaceOnly = z.object({ workspace: z.string().min(1) });

export const verifyDomainAction = action(workspaceOnly, async (input) => {
  const ctx = await requireWorkspace(input.workspace);
  const result = await verifyOwnDomain(db, ctx);
  invalidateSite(ctx.accountId);
  return result ? { status: result.status, error: result.error } : null;
});

export const removeDomainAction = action(workspaceOnly, async (input) => {
  const ctx = await requireWorkspace(input.workspace);
  await removeDomain(db, ctx);
  invalidateSite(ctx.accountId);
});
