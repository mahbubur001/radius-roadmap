import { and, asc, count, eq, inArray, max, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { z } from "zod";
import {
  type categorySchema,
  type createColumnSchema,
  type createRoadmapSchema,
  defaultDisplay,
  type moveColumnSchema,
  type tagSchema,
  type UpdateRoadmapInput,
  type updateCategorySchema,
  type updateColumnSchema,
  updateRoadmapSchema,
} from "@/lib/schemas/roadmap";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  categories,
  roadmapCards,
  roadmapColumns,
  roadmaps,
  tags,
} from "@/server/db/schema";
import {
  assertRole,
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { byPosition, keyAfter, keyBetween } from "./positions";

// Every query is scoped by ctx.accountId AND ctx.workspaceId. The
// WorkspaceContext comes from requireWorkspace(), which already checked the
// user may open this workspace. Settings, columns, categories and deleting
// tags need admin+; cards (cards.ts) are open to everyone with access.

type Scoped = { accountId: AnyPgColumn; workspaceId: AnyPgColumn };

/** WHERE account_id = ctx.accountId AND workspace_id = ctx.workspaceId. */
export function inWorkspace(table: Scoped, ctx: WorkspaceContext): SQL {
  return and(
    eq(table.accountId, ctx.accountId),
    eq(table.workspaceId, ctx.workspaceId),
  ) as SQL;
}

export const DEFAULT_COLUMNS = [
  { name: "In progress", isDone: false },
  { name: "Up next", isDone: false },
  { name: "Future", isDone: false },
  { name: "Done", isDone: true },
];

/** LoopedIn's defaults (doc 16 §3). */
export const DEFAULT_CATEGORIES = [
  { name: "Onboarding", color: "#7c3aed" },
  { name: "Increase Engagement", color: "#2563eb" },
  { name: "Revenue Growth", color: "#16a34a" },
  { name: "User Experience", color: "#ea580c" },
];

async function uniqueRoadmapSlug(
  db: DbOrTx,
  workspaceId: string,
  title: string,
) {
  const base = slugify(title) || "roadmap";
  const rows = await db
    .select({ slug: roadmaps.slug })
    .from(roadmaps)
    .where(eq(roadmaps.workspaceId, workspaceId));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Insert a roadmap with the default columns (no role check). */
async function insertRoadmap(
  db: DbOrTx,
  accountId: string,
  workspaceId: string,
  title: string,
) {
  const [last] = await db
    .select({ p: max(roadmaps.position) })
    .from(roadmaps)
    .where(eq(roadmaps.workspaceId, workspaceId));
  const [roadmap] = await db
    .insert(roadmaps)
    .values({
      accountId,
      workspaceId,
      slug: await uniqueRoadmapSlug(db, workspaceId, title),
      internalTitle: title,
      position: keyAfter(last?.p),
      display: defaultDisplay,
    })
    .returning();
  if (!roadmap) throw new Error("Failed to create roadmap.");

  let position: string | null = null;
  const columns = DEFAULT_COLUMNS.map((c) => {
    position = keyAfter(position);
    return { ...c, accountId, workspaceId, roadmapId: roadmap.id, position };
  });
  await db.insert(roadmapColumns).values(columns);
  return roadmap;
}

/** Defaults for a new workspace: LoopedIn's categories + one roadmap. */
export async function seedWorkspace(
  db: DbOrTx,
  accountId: string,
  workspaceId: string,
) {
  let position: string | null = null;
  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c) => {
      position = keyAfter(position);
      return { ...c, accountId, workspaceId, position };
    }),
  );
  await insertRoadmap(db, accountId, workspaceId, "Roadmap");
}

// ── Roadmaps ────────────────────────────────────────────────────────────

export async function listRoadmaps(db: Db, ctx: WorkspaceContext) {
  return db
    .select()
    .from(roadmaps)
    .where(inWorkspace(roadmaps, ctx))
    .orderBy(byPosition(roadmaps.position));
}

export async function getRoadmap(
  db: DbOrTx,
  ctx: WorkspaceContext,
  id: string,
) {
  const [row] = await db
    .select()
    .from(roadmaps)
    .where(and(inWorkspace(roadmaps, ctx), eq(roadmaps.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Roadmap not found.");
  return row;
}

export async function getRoadmapBySlug(
  db: Db,
  ctx: WorkspaceContext,
  slug: string,
) {
  const [row] = await db
    .select()
    .from(roadmaps)
    .where(and(inWorkspace(roadmaps, ctx), eq(roadmaps.slug, slug)))
    .limit(1);
  if (!row) throw new NotFoundError("Roadmap not found.");
  return row;
}

export async function createRoadmap(
  db: Db,
  ctx: WorkspaceContext,
  input: z.input<typeof createRoadmapSchema>,
) {
  assertRole(ctx, "admin");
  return db.transaction((tx) =>
    insertRoadmap(tx, ctx.accountId, ctx.workspaceId, input.title.trim()),
  );
}

export async function updateRoadmap(
  db: Db,
  ctx: WorkspaceContext,
  input: UpdateRoadmapInput,
) {
  assertRole(ctx, "admin");
  const { id, ...data } = updateRoadmapSchema.parse(input);
  const [row] = await db
    .update(roadmaps)
    .set(data)
    .where(and(inWorkspace(roadmaps, ctx), eq(roadmaps.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Roadmap not found.");
  return row;
}

export async function deleteRoadmap(db: Db, ctx: WorkspaceContext, id: string) {
  assertRole(ctx, "admin");
  await getRoadmap(db, ctx, id);
  // Columns, cards, features and votes cascade with the roadmap.
  await db
    .delete(roadmaps)
    .where(and(inWorkspace(roadmaps, ctx), eq(roadmaps.id, id)));
}

// ── Columns ─────────────────────────────────────────────────────────────

export async function listColumns(
  db: DbOrTx,
  ctx: WorkspaceContext,
  roadmapId: string,
) {
  return db
    .select()
    .from(roadmapColumns)
    .where(
      and(
        inWorkspace(roadmapColumns, ctx),
        eq(roadmapColumns.roadmapId, roadmapId),
      ),
    )
    .orderBy(byPosition(roadmapColumns.position));
}

export async function getColumn(db: DbOrTx, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select()
    .from(roadmapColumns)
    .where(and(inWorkspace(roadmapColumns, ctx), eq(roadmapColumns.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Column not found.");
  return row;
}

export async function createColumn(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof createColumnSchema>,
) {
  assertRole(ctx, "admin");
  await getRoadmap(db, ctx, input.roadmapId);
  const columns = await listColumns(db, ctx, input.roadmapId);
  const [row] = await db
    .insert(roadmapColumns)
    .values({
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      roadmapId: input.roadmapId,
      name: input.name,
      position: keyAfter(columns.at(-1)?.position),
    })
    .returning();
  return row;
}

export async function updateColumn(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof updateColumnSchema>,
) {
  assertRole(ctx, "admin");
  const { id, ...data } = input;
  const [row] = await db
    .update(roadmapColumns)
    .set(data)
    .where(and(inWorkspace(roadmapColumns, ctx), eq(roadmapColumns.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Column not found.");
  return row;
}

export async function moveColumn(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof moveColumnSchema>,
) {
  assertRole(ctx, "admin");
  const column = await getColumn(db, ctx, input.id);
  const siblings = await listColumns(db, ctx, column.roadmapId);
  const pos = (id: string | null) =>
    id ? siblings.find((c) => c.id === id)?.position : null;
  const position = keyBetween(
    pos(input.prevId),
    pos(input.nextId),
    siblings.filter((c) => c.id !== column.id).at(-1)?.position,
  );
  await db
    .update(roadmapColumns)
    .set({ position })
    .where(
      and(inWorkspace(roadmapColumns, ctx), eq(roadmapColumns.id, column.id)),
    );
  return position;
}

export async function deleteColumn(db: Db, ctx: WorkspaceContext, id: string) {
  assertRole(ctx, "admin");
  const column = await getColumn(db, ctx, id);
  const [cards] = await db
    .select({ n: count() })
    .from(roadmapCards)
    .where(
      and(inWorkspace(roadmapCards, ctx), eq(roadmapCards.columnId, column.id)),
    );
  if ((cards?.n ?? 0) > 0) {
    throw new ConflictError("Move or delete this column's cards first.");
  }
  await db
    .delete(roadmapColumns)
    .where(and(inWorkspace(roadmapColumns, ctx), eq(roadmapColumns.id, id)));
}

// ── Categories and tags ─────────────────────────────────────────────────

export async function listCategories(db: DbOrTx, ctx: WorkspaceContext) {
  return db
    .select()
    .from(categories)
    .where(inWorkspace(categories, ctx))
    .orderBy(byPosition(categories.position));
}

export async function createCategory(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof categorySchema>,
) {
  assertRole(ctx, "admin");
  const existing = await listCategories(db, ctx);
  try {
    const [row] = await db
      .insert(categories)
      .values({
        accountId: ctx.accountId,
        workspaceId: ctx.workspaceId,
        name: input.name,
        color: input.color,
        position: keyAfter(existing.at(-1)?.position),
      })
      .returning();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("That category already exists.");
    }
    throw error;
  }
}

export async function updateCategory(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof updateCategorySchema>,
) {
  assertRole(ctx, "admin");
  const { id, ...data } = input;
  try {
    const [row] = await db
      .update(categories)
      .set(data)
      .where(and(inWorkspace(categories, ctx), eq(categories.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Category not found.");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("That category already exists.");
    }
    throw error;
  }
}

/** Cards in the category keep existing, uncategorised (FK set null). */
export async function deleteCategory(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  assertRole(ctx, "admin");
  await db
    .delete(categories)
    .where(and(inWorkspace(categories, ctx), eq(categories.id, id)));
}

export async function listTags(db: DbOrTx, ctx: WorkspaceContext) {
  return db
    .select()
    .from(tags)
    .where(inWorkspace(tags, ctx))
    .orderBy(asc(tags.name));
}

/** Anyone with access can create tags while editing a card. */
export async function createTag(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof tagSchema>,
) {
  const [row] = await db
    .insert(tags)
    .values({
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      name: input.name,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(tags)
    .where(and(inWorkspace(tags, ctx), eq(tags.name, input.name)))
    .limit(1);
  if (!existing) throw new NotFoundError("Tag not found.");
  return existing;
}

export async function deleteTag(db: Db, ctx: WorkspaceContext, id: string) {
  assertRole(ctx, "admin");
  await db.delete(tags).where(and(inWorkspace(tags, ctx), eq(tags.id, id)));
}

/** Keeps only ids that belong to this workspace. */
export async function ownTagIds(
  db: DbOrTx,
  ctx: WorkspaceContext,
  ids: readonly string[],
) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(inWorkspace(tags, ctx), inArray(tags.id, [...ids])));
  return rows.map((r) => r.id);
}
