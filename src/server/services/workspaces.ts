import { and, asc, count, eq, inArray, type SQL } from "drizzle-orm";
import {
  type CreateWorkspaceInput,
  createWorkspaceSchema,
  type UpdateWorkspaceInput,
  updateWorkspaceSchema,
} from "@/lib/schemas/workspace";
import type { Db } from "@/server/db/client";
import { workspaceMembers, workspaces } from "@/server/db/schema";
import {
  type AccountContext,
  assertRole,
  ConflictError,
  ForbiddenError,
  isUniqueViolation,
  NotFoundError,
  seesAllWorkspaces,
} from "./context";
import { getPlanLimits } from "./plan-limits";

// Every query here is scoped by ctx.accountId. Never accept an accountId
// from the client. Members only see workspaces granted in workspace_members.

/** WHERE clause for the workspaces `ctx` may open. */
function accessible(db: Db, ctx: AccountContext): SQL | undefined {
  const inAccount = eq(workspaces.accountId, ctx.accountId);
  if (seesAllWorkspaces(ctx)) return inAccount;
  const granted = db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.accountId, ctx.accountId),
        eq(workspaceMembers.userId, ctx.userId),
      ),
    );
  return and(inAccount, inArray(workspaces.id, granted));
}

export async function listWorkspaces(db: Db, ctx: AccountContext) {
  return db
    .select()
    .from(workspaces)
    .where(accessible(db, ctx))
    .orderBy(asc(workspaces.createdAt));
}

export async function getWorkspaceBySlug(
  db: Db,
  ctx: AccountContext,
  slug: string,
) {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(and(accessible(db, ctx), eq(workspaces.slug, slug)))
    .limit(1);
  if (!row) throw new NotFoundError("Workspace not found.");
  return row;
}

/** A workspace by id, if `ctx` may open it. */
export async function getWorkspaceById(
  db: Db,
  ctx: AccountContext,
  id: string,
) {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(and(accessible(db, ctx), eq(workspaces.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Workspace not found.");
  return row;
}

async function getOwnWorkspace(db: Db, ctx: AccountContext, id: string) {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.accountId, ctx.accountId), eq(workspaces.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Workspace not found.");
  return row;
}

export async function createWorkspace(
  db: Db,
  ctx: AccountContext,
  input: CreateWorkspaceInput,
) {
  assertRole(ctx, "admin");
  const data = createWorkspaceSchema.parse(input);

  const limits = await getPlanLimits(db, ctx.accountId);
  const [existing] = await db
    .select({ n: count() })
    .from(workspaces)
    .where(eq(workspaces.accountId, ctx.accountId));
  if ((existing?.n ?? 0) >= limits.workspaces) {
    throw new ForbiddenError("Your plan doesn't allow more workspaces.");
  }

  try {
    const [row] = await db
      .insert(workspaces)
      .values({ accountId: ctx.accountId, name: data.name, slug: data.slug })
      .returning();
    if (!row) throw new Error("Failed to create workspace.");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("That workspace URL is already used.");
    }
    throw error;
  }
}

export async function updateWorkspace(
  db: Db,
  ctx: AccountContext,
  id: string,
  input: UpdateWorkspaceInput,
) {
  assertRole(ctx, "admin");
  const data = updateWorkspaceSchema.parse(input);
  const current = await getOwnWorkspace(db, ctx, id);
  try {
    const [row] = await db
      .update(workspaces)
      .set({
        name: data.name,
        slug: data.slug,
        settings: { ...current.settings, ...data.settings },
      })
      .where(
        and(eq(workspaces.accountId, ctx.accountId), eq(workspaces.id, id)),
      )
      .returning();
    if (!row) throw new NotFoundError("Workspace not found.");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("That workspace URL is already used.");
    }
    throw error;
  }
}

/** Store (or clear) the workspace logo's storage key. */
export async function setWorkspaceLogo(
  db: Db,
  ctx: AccountContext,
  id: string,
  logo: string | null,
) {
  assertRole(ctx, "admin");
  await getOwnWorkspace(db, ctx, id);
  await db
    .update(workspaces)
    .set({ logo })
    .where(and(eq(workspaces.accountId, ctx.accountId), eq(workspaces.id, id)));
}

export async function deleteWorkspace(db: Db, ctx: AccountContext, id: string) {
  assertRole(ctx, "admin");
  await getOwnWorkspace(db, ctx, id);
  const [total] = await db
    .select({ n: count() })
    .from(workspaces)
    .where(eq(workspaces.accountId, ctx.accountId));
  if ((total?.n ?? 0) <= 1) {
    throw new ForbiddenError("An account needs at least one workspace.");
  }
  // workspace_members rows cascade with the workspace.
  await db
    .delete(workspaces)
    .where(and(eq(workspaces.accountId, ctx.accountId), eq(workspaces.id, id)));
}

/** Replace a member's workspace access with `workspaceIds` (own account only). */
export async function setWorkspaceAccess(
  db: Db,
  ctx: AccountContext,
  userId: string,
  workspaceIds: readonly string[],
) {
  assertRole(ctx, "admin");
  await db.transaction(async (tx) => {
    const valid = workspaceIds.length
      ? await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(
            and(
              eq(workspaces.accountId, ctx.accountId),
              inArray(workspaces.id, [...workspaceIds]),
            ),
          )
      : [];
    await tx
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.accountId, ctx.accountId),
          eq(workspaceMembers.userId, userId),
        ),
      );
    if (valid.length) {
      await tx.insert(workspaceMembers).values(
        valid.map((w) => ({
          accountId: ctx.accountId,
          workspaceId: w.id,
          userId,
        })),
      );
    }
  });
}

/** Workspace ids a user was granted in this account (for the team page). */
export async function listWorkspaceAccess(db: Db, ctx: AccountContext) {
  return db
    .select({
      userId: workspaceMembers.userId,
      workspaceId: workspaceMembers.workspaceId,
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.accountId, ctx.accountId));
}
