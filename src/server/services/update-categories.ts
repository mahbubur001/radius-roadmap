import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type {
  editUpdateCategorySchema,
  updateCategorySchema,
} from "@/lib/schemas/updates";
import type { Db, DbOrTx } from "@/server/db/client";
import { updateCategories } from "@/server/db/schema";
import {
  assertRole,
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { byPosition, keyAfter } from "./positions";
import { inWorkspace } from "./roadmaps";

// Update categories (doc 23 §3): coloured labels for posts, per workspace,
// separate from roadmap objectives. Admins manage them.

/** doc 15 §9 #5. Keep in sync with migration 0007. */
export const DEFAULT_UPDATE_CATEGORIES = [
  { name: "New feature", color: "#16a34a" },
  { name: "Improvement", color: "#2563eb" },
  { name: "Fix", color: "#dc2626" },
  { name: "Maintenance", color: "#64748b" },
  { name: "Announcement", color: "#7c3aed" },
  { name: "Coming soon", color: "#d97706" },
] as const;

export async function seedUpdateCategories(
  db: DbOrTx,
  accountId: string,
  workspaceId: string,
) {
  let position: string | null = null;
  await db.insert(updateCategories).values(
    DEFAULT_UPDATE_CATEGORIES.map((c) => {
      position = keyAfter(position);
      return { ...c, accountId, workspaceId, position };
    }),
  );
}

export async function listUpdateCategories(db: DbOrTx, ctx: WorkspaceContext) {
  return db
    .select()
    .from(updateCategories)
    .where(inWorkspace(updateCategories, ctx))
    .orderBy(byPosition(updateCategories.position));
}

function conflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictError("That category already exists.");
  }
  throw error;
}

export async function createUpdateCategory(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof updateCategorySchema>,
) {
  assertRole(ctx, "admin");
  const existing = await listUpdateCategories(db, ctx);
  try {
    const [row] = await db
      .insert(updateCategories)
      .values({
        accountId: ctx.accountId,
        workspaceId: ctx.workspaceId,
        name: input.name,
        color: input.color,
        position: keyAfter(existing.at(-1)?.position),
      })
      .returning();
    if (!row) throw new Error("Failed to create the category.");
    return row;
  } catch (error) {
    conflict(error);
  }
}

export async function editUpdateCategory(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof editUpdateCategorySchema>,
) {
  assertRole(ctx, "admin");
  const { id, ...data } = input;
  try {
    const [row] = await db
      .update(updateCategories)
      .set(data)
      .where(
        and(inWorkspace(updateCategories, ctx), eq(updateCategories.id, id)),
      )
      .returning();
    if (!row) throw new NotFoundError("Category not found.");
    return row;
  } catch (error) {
    conflict(error);
  }
}

/** Posts in the category keep existing, uncategorised (FK set null). */
export async function deleteUpdateCategory(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  assertRole(ctx, "admin");
  const [row] = await db
    .delete(updateCategories)
    .where(and(inWorkspace(updateCategories, ctx), eq(updateCategories.id, id)))
    .returning({ id: updateCategories.id });
  if (!row) throw new NotFoundError("Category not found.");
}
