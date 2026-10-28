import { and, count, eq, max } from "drizzle-orm";
import type { z } from "zod";
import type {
  createBoardSchema,
  moveStatusSchema,
  statusSchema,
  updateBoardSchema,
  updateStatusSchema,
} from "@/lib/schemas/feedback";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  type FeedbackStatusKind,
  feedbackBoards,
  feedbackItems,
  feedbackStatuses,
} from "@/server/db/schema";
import {
  assertRole,
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { byPosition, keyAfter, keyBetween } from "./positions";
import { inWorkspace } from "./roadmaps";

// Feedback boards and statuses (doc 20 §3.1–3.2). Settings need admin+.

/** Doc 16 §8 #3: status is separate from category. */
export const DEFAULT_STATUSES: {
  name: string;
  color: string;
  kind: FeedbackStatusKind;
}[] = [
  { name: "New", color: "#64748b", kind: "open" },
  { name: "Under review", color: "#0891b2", kind: "open" },
  { name: "Planned", color: "#7c3aed", kind: "planned" },
  { name: "In progress", color: "#2563eb", kind: "in_progress" },
  { name: "Done", color: "#16a34a", kind: "done" },
  { name: "Declined", color: "#dc2626", kind: "declined" },
];

export const DEFAULT_BOARD = {
  name: "Feature requests",
  slug: "feature-requests",
};

/** Defaults for a new workspace: one public board + the default statuses. */
export async function seedFeedback(
  db: DbOrTx,
  accountId: string,
  workspaceId: string,
) {
  let position: string | null = null;
  await db.insert(feedbackStatuses).values(
    DEFAULT_STATUSES.map((s) => {
      position = keyAfter(position);
      return { ...s, accountId, workspaceId, position };
    }),
  );
  await db.insert(feedbackBoards).values({
    ...DEFAULT_BOARD,
    accountId,
    workspaceId,
    position: keyAfter(null),
  });
}

function conflict(error: unknown, message: string): never {
  if (isUniqueViolation(error)) throw new ConflictError(message);
  throw error;
}

// ── Boards ──────────────────────────────────────────────────────────────

export async function createBoard(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof createBoardSchema>,
) {
  assertRole(ctx, "admin");
  const [last] = await db
    .select({ p: max(feedbackBoards.position) })
    .from(feedbackBoards)
    .where(inWorkspace(feedbackBoards, ctx));
  try {
    const [row] = await db
      .insert(feedbackBoards)
      .values({
        accountId: ctx.accountId,
        workspaceId: ctx.workspaceId,
        name: input.name,
        slug: slugify(input.name) || "board",
        position: keyAfter(last?.p),
      })
      .returning();
    if (!row) throw new Error("Failed to create board.");
    return row;
  } catch (error) {
    conflict(error, "A board with that URL already exists.");
  }
}

export async function updateBoard(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof updateBoardSchema>,
) {
  assertRole(ctx, "admin");
  const { id, ...set } = input;
  try {
    const [row] = await db
      .update(feedbackBoards)
      .set(set)
      .where(and(inWorkspace(feedbackBoards, ctx), eq(feedbackBoards.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Board not found.");
    return row;
  } catch (error) {
    conflict(error, "A board with that URL already exists.");
  }
}

/** Only an empty board can be deleted, and never the last one. */
export async function deleteBoard(db: Db, ctx: WorkspaceContext, id: string) {
  assertRole(ctx, "admin");
  const [[items], [boards]] = await Promise.all([
    db
      .select({ n: count() })
      .from(feedbackItems)
      .where(
        and(inWorkspace(feedbackItems, ctx), eq(feedbackItems.boardId, id)),
      ),
    db
      .select({ n: count() })
      .from(feedbackBoards)
      .where(inWorkspace(feedbackBoards, ctx)),
  ]);
  if ((items?.n ?? 0) > 0) {
    throw new ConflictError("Move or delete this board's feedback first.");
  }
  if ((boards?.n ?? 0) <= 1) {
    throw new ConflictError("A workspace needs at least one board.");
  }
  const [row] = await db
    .delete(feedbackBoards)
    .where(and(inWorkspace(feedbackBoards, ctx), eq(feedbackBoards.id, id)))
    .returning({ id: feedbackBoards.id });
  if (!row) throw new NotFoundError("Board not found.");
}

// ── Statuses ────────────────────────────────────────────────────────────

async function orderedStatuses(db: DbOrTx, ctx: WorkspaceContext) {
  return db
    .select()
    .from(feedbackStatuses)
    .where(inWorkspace(feedbackStatuses, ctx))
    .orderBy(byPosition(feedbackStatuses.position));
}

export async function createStatus(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof statusSchema>,
) {
  assertRole(ctx, "admin");
  const existing = await orderedStatuses(db, ctx);
  try {
    const [row] = await db
      .insert(feedbackStatuses)
      .values({
        ...input,
        accountId: ctx.accountId,
        workspaceId: ctx.workspaceId,
        position: keyAfter(existing.at(-1)?.position),
      })
      .returning();
    if (!row) throw new Error("Failed to create status.");
    return row;
  } catch (error) {
    conflict(error, "That status already exists.");
  }
}

export async function updateStatus(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof updateStatusSchema>,
) {
  assertRole(ctx, "admin");
  const { id, ...set } = input;
  try {
    const [row] = await db
      .update(feedbackStatuses)
      .set(set)
      .where(
        and(inWorkspace(feedbackStatuses, ctx), eq(feedbackStatuses.id, id)),
      )
      .returning();
    if (!row) throw new NotFoundError("Status not found.");
    return row;
  } catch (error) {
    conflict(error, "That status already exists.");
  }
}

export async function moveStatus(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof moveStatusSchema>,
) {
  assertRole(ctx, "admin");
  const all = await orderedStatuses(db, ctx);
  if (!all.some((s) => s.id === input.id)) {
    throw new NotFoundError("Status not found.");
  }
  const others = all.filter((s) => s.id !== input.id);
  const pos = (id: string | null) =>
    id ? others.find((s) => s.id === id)?.position : null;
  const position = keyBetween(
    pos(input.prevId),
    pos(input.nextId),
    others.at(-1)?.position,
  );
  await db
    .update(feedbackStatuses)
    .set({ position })
    .where(
      and(
        inWorkspace(feedbackStatuses, ctx),
        eq(feedbackStatuses.id, input.id),
      ),
    );
  return position;
}

/** Only a status no item uses can be deleted, and never the last one. */
export async function deleteStatus(db: Db, ctx: WorkspaceContext, id: string) {
  assertRole(ctx, "admin");
  const [[used], all] = await Promise.all([
    db
      .select({ n: count() })
      .from(feedbackItems)
      .where(
        and(inWorkspace(feedbackItems, ctx), eq(feedbackItems.statusId, id)),
      ),
    orderedStatuses(db, ctx),
  ]);
  if ((used?.n ?? 0) > 0) {
    throw new ConflictError("Move the feedback with this status first.");
  }
  if (all.length <= 1) {
    throw new ConflictError("A workspace needs at least one status.");
  }
  const [row] = await db
    .delete(feedbackStatuses)
    .where(and(inWorkspace(feedbackStatuses, ctx), eq(feedbackStatuses.id, id)))
    .returning({ id: feedbackStatuses.id });
  if (!row) throw new NotFoundError("Status not found.");
}
