import { and, asc, eq } from "drizzle-orm";
import {
  type CreateWorkspaceInput,
  createWorkspaceSchema,
} from "@/lib/schemas/workspace";
import type { Db } from "@/server/db/client";
import { workspaces } from "@/server/db/schema";
import { type AccountContext, assertRole, NotFoundError } from "./context";

// Every query here is scoped by ctx.accountId. Never accept an accountId
// from the client.

export async function listWorkspaces(db: Db, ctx: AccountContext) {
  return db
    .select()
    .from(workspaces)
    .where(eq(workspaces.accountId, ctx.accountId))
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
    .where(
      and(eq(workspaces.accountId, ctx.accountId), eq(workspaces.slug, slug)),
    )
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
  const [row] = await db
    .insert(workspaces)
    .values({ accountId: ctx.accountId, name: data.name, slug: data.slug })
    .returning();
  if (!row) throw new Error("Failed to create workspace.");
  return row;
}
