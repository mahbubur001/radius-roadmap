import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { z } from "zod";
import { richTextToPlain } from "@/lib/rich-text";
import {
  type createFeedbackSchema,
  type FeedbackFilter,
  feedbackFilterSchema,
  PRIORITY_BUCKETS,
  priorityScore,
  type UpdateFeedbackInput,
  updateFeedbackSchema,
} from "@/lib/schemas/feedback";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  cardFeedbackLinks,
  categories,
  type FeedbackItem,
  type FeedbackStatusKind,
  feedbackBoards,
  feedbackItems,
  feedbackStatuses,
  feedbackTags,
  trackedUsers,
  user,
} from "@/server/db/schema";
import { likePattern } from "./cards";
import {
  isUniqueViolation,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { byPosition } from "./positions";
import { inWorkspace, ownTagIds } from "./roadmaps";

// Feedback items (doc 20 §4.1). Everyone with workspace access can create,
// edit and triage feedback; every query is scoped by account + workspace.

// ── Boards and statuses ─────────────────────────────────────────────────

export async function listBoards(db: DbOrTx, ctx: WorkspaceContext) {
  return db
    .select()
    .from(feedbackBoards)
    .where(inWorkspace(feedbackBoards, ctx))
    .orderBy(byPosition(feedbackBoards.position));
}

export async function getBoard(db: DbOrTx, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select()
    .from(feedbackBoards)
    .where(and(inWorkspace(feedbackBoards, ctx), eq(feedbackBoards.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Board not found.");
  return row;
}

export async function listStatuses(db: DbOrTx, ctx: WorkspaceContext) {
  return db
    .select()
    .from(feedbackStatuses)
    .where(inWorkspace(feedbackStatuses, ctx))
    .orderBy(byPosition(feedbackStatuses.position));
}

async function getStatus(db: DbOrTx, ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select()
    .from(feedbackStatuses)
    .where(and(inWorkspace(feedbackStatuses, ctx), eq(feedbackStatuses.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Status not found.");
  return row;
}

/** The first status of a kind, in board order (status sync, doc 20 D5). */
export async function firstStatusOfKind(
  db: DbOrTx,
  ctx: WorkspaceContext,
  kind: FeedbackStatusKind,
) {
  const [row] = await db
    .select()
    .from(feedbackStatuses)
    .where(
      and(inWorkspace(feedbackStatuses, ctx), eq(feedbackStatuses.kind, kind)),
    )
    .orderBy(byPosition(feedbackStatuses.position))
    .limit(1);
  return row ?? null;
}

// ── Items ───────────────────────────────────────────────────────────────

export async function getFeedback(
  db: DbOrTx,
  ctx: WorkspaceContext,
  id: string,
) {
  const [row] = await db
    .select()
    .from(feedbackItems)
    .where(and(inWorkspace(feedbackItems, ctx), eq(feedbackItems.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError("Feedback not found.");
  return row;
}

async function uniqueFeedbackSlug(
  db: DbOrTx,
  workspaceId: string,
  title: string,
) {
  const base = slugify(title) || "feedback";
  const rows = await db
    .select({ slug: feedbackItems.slug })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.workspaceId, workspaceId),
        ilike(feedbackItems.slug, `${base.replace(/[\\%_]/g, "\\$&")}%`),
      ),
    );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Insert an item (no checks) with a free slug, retrying on a race. */
export async function insertFeedback(
  db: DbOrTx,
  values: Omit<typeof feedbackItems.$inferInsert, "slug">,
): Promise<FeedbackItem> {
  for (let attempt = 0; ; attempt++) {
    const slug = await uniqueFeedbackSlug(db, values.workspaceId, values.title);
    try {
      const [row] = await db
        .insert(feedbackItems)
        .values({ ...values, slug })
        .returning();
      if (!row) throw new Error("Failed to create feedback.");
      return row;
    } catch (error) {
      if (attempt < 2 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}

/** Created by a team member: approved straight away, first status. */
export async function createFeedback(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof createFeedbackSchema>,
) {
  const board = await getBoard(db, ctx, input.boardId);
  const [status] = await listStatuses(db, ctx);
  if (!status) throw new NotFoundError("Add a status first.");
  return insertFeedback(db, {
    accountId: ctx.accountId,
    workspaceId: ctx.workspaceId,
    boardId: board.id,
    statusId: status.id,
    title: input.title,
    review: "approved",
    source: "admin",
    authorUserId: ctx.userId,
  });
}

/**
 * Autosave: applies only the fields present in the patch. Moving to a
 * `done` status marks the item complete; any other status reopens it.
 */
export async function updateFeedback(
  db: Db,
  ctx: WorkspaceContext,
  input: UpdateFeedbackInput,
) {
  const { id, tagIds, summaryJson, categoryId, boardId, statusId, ...rest } =
    updateFeedbackSchema.parse(input);
  await getFeedback(db, ctx, id);

  const set: Partial<typeof feedbackItems.$inferInsert> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (summaryJson !== undefined) {
    set.summaryJson = summaryJson;
    set.summaryText = richTextToPlain(summaryJson);
  }
  if (boardId !== undefined)
    set.boardId = (await getBoard(db, ctx, boardId)).id;
  if (statusId !== undefined) {
    const status = await getStatus(db, ctx, statusId);
    set.statusId = status.id;
    set.completedAt = status.kind === "done" ? new Date() : null;
  }
  if (categoryId !== undefined) {
    if (categoryId) {
      const [own] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(inWorkspace(categories, ctx), eq(categories.id, categoryId)))
        .limit(1);
      if (!own) throw new NotFoundError("Category not found.");
    }
    set.categoryId = categoryId;
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(feedbackItems)
      .set(set)
      .where(and(inWorkspace(feedbackItems, ctx), eq(feedbackItems.id, id)))
      .returning();
    if (!row) throw new NotFoundError("Feedback not found.");
    if (tagIds !== undefined) {
      const valid = await ownTagIds(tx, ctx, tagIds);
      await tx.delete(feedbackTags).where(eq(feedbackTags.feedbackId, id));
      if (valid.length) {
        await tx
          .insert(feedbackTags)
          .values(valid.map((tagId) => ({ feedbackId: id, tagId })));
      }
    }
    return row;
  });
}

/** Complete → first `done` status; reopen → first `open` status. */
export async function setFeedbackCompleted(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
  completed: boolean,
) {
  await getFeedback(db, ctx, id);
  const status = await firstStatusOfKind(db, ctx, completed ? "done" : "open");
  const [row] = await db
    .update(feedbackItems)
    .set({
      completedAt: completed ? new Date() : null,
      ...(status ? { statusId: status.id } : {}),
    })
    .where(and(inWorkspace(feedbackItems, ctx), eq(feedbackItems.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Feedback not found.");
  return row;
}

export async function setFeedbackArchived(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
  archived: boolean,
) {
  const [row] = await db
    .update(feedbackItems)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(inWorkspace(feedbackItems, ctx), eq(feedbackItems.id, id)))
    .returning();
  if (!row) throw new NotFoundError("Feedback not found.");
  return row;
}

export async function deleteFeedback(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const [row] = await db
    .delete(feedbackItems)
    .where(and(inWorkspace(feedbackItems, ctx), eq(feedbackItems.id, id)))
    .returning({ id: feedbackItems.id });
  if (!row) throw new NotFoundError("Feedback not found.");
}

// ── Admin list ──────────────────────────────────────────────────────────

export type FeedbackRow = {
  id: string;
  slug: string;
  boardId: string;
  title: string;
  summaryText: string;
  statusId: string;
  categoryId: string | null;
  isPublic: boolean;
  review: FeedbackItem["review"];
  impact: number | null;
  effort: number | null;
  priority: number | null;
  votes: number;
  comments: number;
  completed: boolean;
  archived: boolean;
  linkedCards: number;
  tagIds: string[];
  updatedAt: string;
};

const scoreSql = sql<
  number | null
>`(${feedbackItems.impact} + (6 - ${feedbackItems.effort}))`;

const isLinked = exists(
  sql`(select 1 from ${cardFeedbackLinks} where ${cardFeedbackLinks.feedbackId} = ${feedbackItems.id})`,
);

/** Feedback for the admin list. Rejected items only show under "archived". */
export async function listFeedback(
  db: Db,
  ctx: WorkspaceContext,
  filter: FeedbackFilter = {},
): Promise<FeedbackRow[]> {
  const f = feedbackFilterSchema.parse(filter);
  const where: SQL[] = [inWorkspace(feedbackItems, ctx)];

  if (f.boardId) where.push(eq(feedbackItems.boardId, f.boardId));
  if (f.q) {
    where.push(
      or(
        sql`${feedbackItems.search} @@ websearch_to_tsquery('english', ${f.q})`,
        ilike(feedbackItems.title, likePattern(f.q)),
      ) as SQL,
    );
  }
  if (f.statusId) where.push(eq(feedbackItems.statusId, f.statusId));
  if (f.categoryId) where.push(eq(feedbackItems.categoryId, f.categoryId));
  if (f.tagId) {
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(feedbackTags)
          .where(
            and(
              eq(feedbackTags.feedbackId, feedbackItems.id),
              eq(feedbackTags.tagId, f.tagId),
            ),
          ),
      ),
    );
  }
  if (f.visibility !== "all") {
    where.push(eq(feedbackItems.isPublic, f.visibility === "public"));
  }
  if (f.linked === "linked") where.push(isLinked);
  if (f.linked === "unlinked") where.push(not(isLinked));
  if (f.priority === "none") {
    where.push(
      or(isNull(feedbackItems.impact), isNull(feedbackItems.effort)) as SQL,
    );
  } else if (f.priority !== "all") {
    const b = PRIORITY_BUCKETS[f.priority];
    where.push(sql`${scoreSql} between ${b.min} and ${b.max}`);
  }
  if (f.state === "open") {
    where.push(
      isNull(feedbackItems.archivedAt),
      isNull(feedbackItems.completedAt),
      not(eq(feedbackItems.review, "rejected")),
    );
  } else if (f.state === "completed") {
    where.push(
      isNull(feedbackItems.archivedAt),
      isNotNull(feedbackItems.completedAt),
    );
  } else if (f.state === "archived") {
    where.push(
      or(
        isNotNull(feedbackItems.archivedAt),
        eq(feedbackItems.review, "rejected"),
      ) as SQL,
    );
  }

  const total = sql`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`;
  const order = {
    votes: [desc(total), desc(feedbackItems.createdAt)],
    newest: [desc(feedbackItems.createdAt)],
    oldest: [asc(feedbackItems.createdAt)],
    updated: [desc(feedbackItems.updatedAt)],
    priority: [sql`${scoreSql} desc nulls last`, desc(total)],
  }[f.sort];

  const rows = await db
    .select({
      id: feedbackItems.id,
      slug: feedbackItems.slug,
      boardId: feedbackItems.boardId,
      title: feedbackItems.title,
      summaryText: feedbackItems.summaryText,
      statusId: feedbackItems.statusId,
      categoryId: feedbackItems.categoryId,
      isPublic: feedbackItems.isPublic,
      review: feedbackItems.review,
      impact: feedbackItems.impact,
      effort: feedbackItems.effort,
      voteCount: feedbackItems.voteCount,
      importedVotes: feedbackItems.importedVotes,
      commentCount: feedbackItems.commentCount,
      completedAt: feedbackItems.completedAt,
      archivedAt: feedbackItems.archivedAt,
      updatedAt: feedbackItems.updatedAt,
    })
    .from(feedbackItems)
    .where(and(...where))
    .orderBy(...order)
    .limit(500);

  const ids = rows.map((r) => r.id);
  const [tagRows, linkRows] = ids.length
    ? await Promise.all([
        db
          .select()
          .from(feedbackTags)
          .where(inArray(feedbackTags.feedbackId, ids)),
        db
          .select({ feedbackId: cardFeedbackLinks.feedbackId })
          .from(cardFeedbackLinks)
          .where(
            and(
              eq(cardFeedbackLinks.accountId, ctx.accountId),
              inArray(cardFeedbackLinks.feedbackId, ids),
            ),
          ),
      ])
    : [[], []];

  return rows.map(
    ({
      voteCount,
      importedVotes,
      commentCount,
      completedAt,
      archivedAt,
      updatedAt,
      ...r
    }) => ({
      ...r,
      summaryText: r.summaryText.slice(0, 200),
      priority: priorityScore(r.impact, r.effort),
      votes: voteCount + importedVotes,
      comments: commentCount,
      completed: !!completedAt,
      archived: !!archivedAt,
      linkedCards: linkRows.filter((l) => l.feedbackId === r.id).length,
      tagIds: tagRows.filter((t) => t.feedbackId === r.id).map((t) => t.tagId),
      updatedAt: updatedAt.toISOString(),
    }),
  );
}

/** Everything the feedback drawer needs. */
export async function getFeedbackDetail(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const item = await getFeedback(db, ctx, id);
  const [tagRows, [tracked], [member]] = await Promise.all([
    db
      .select({ tagId: feedbackTags.tagId })
      .from(feedbackTags)
      .where(eq(feedbackTags.feedbackId, id)),
    item.authorTrackedUserId
      ? db
          .select({
            name: trackedUsers.name,
            email: trackedUsers.email,
            kind: trackedUsers.kind,
          })
          .from(trackedUsers)
          .where(
            and(
              eq(trackedUsers.accountId, ctx.accountId),
              eq(trackedUsers.id, item.authorTrackedUserId),
            ),
          )
      : [],
    item.authorUserId
      ? db
          .select({ name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, item.authorUserId))
      : [],
  ]);
  const { search: _search, ...rest } = item;
  return {
    ...rest,
    tagIds: tagRows.map((t) => t.tagId),
    author: tracked
      ? { ...tracked, team: false }
      : member
        ? { ...member, kind: null, team: true }
        : null,
  };
}
