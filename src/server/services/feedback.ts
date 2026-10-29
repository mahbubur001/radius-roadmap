import {
  and,
  asc,
  count,
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
  type bulkUpdateFeedbackSchema,
  type createFeedbackSchema,
  type FeedbackFilter,
  feedbackFilterSchema,
  PRIORITY_BUCKETS,
  priorityScore,
  type ReviewAction,
  type UpdateFeedbackInput,
  updateFeedbackSchema,
} from "@/lib/schemas/feedback";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  cardFeedbackLinks,
  comments,
  type FeedbackItem,
  type FeedbackStatusKind,
  feedbackBoards,
  feedbackItems,
  feedbackStatuses,
  feedbackTags,
  follows,
  objectives,
  trackedUsers,
  user,
  votes,
} from "@/server/db/schema";
import { likePattern } from "./cards";
import {
  ConflictError,
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
        // Followers hear about status *changes*, not the starting status.
        .values({ ...values, slug, notifiedStatusId: values.statusId })
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
  const { id, tagIds, summaryJson, objectiveId, boardId, statusId, ...rest } =
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
  if (objectiveId !== undefined) {
    if (objectiveId) {
      const [own] = await db
        .select({ id: objectives.id })
        .from(objectives)
        .where(
          and(inWorkspace(objectives, ctx), eq(objectives.id, objectiveId)),
        )
        .limit(1);
      if (!own) throw new NotFoundError("Objective not found.");
    }
    set.objectiveId = objectiveId;
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

// ── Merge and duplicate (doc 20 §1, doc 16 §8 #13) ───────────────────────

/**
 * Folds `sourceId` into `targetId`: votes (a voter who voted both keeps one
 * vote), followers, comments, card links and tags move over; imported vote
 * totals add up. The source is archived with `merged_into_id`, so its public
 * URL can redirect. Items merged into the source earlier now point at the
 * target. Cached counts are recomputed from the rows.
 */
export async function mergeFeedback(
  db: Db,
  ctx: WorkspaceContext,
  sourceId: string,
  targetId: string,
) {
  if (sourceId === targetId) {
    throw new ConflictError("Pick another item to merge into.");
  }
  const [source, target] = await Promise.all([
    getFeedback(db, ctx, sourceId),
    getFeedback(db, ctx, targetId),
  ]);
  if (target.mergedIntoId) {
    throw new ConflictError("That item was itself merged into another one.");
  }
  if (source.mergedIntoId) {
    throw new ConflictError("This item was already merged.");
  }

  return db.transaction(async (tx) => {
    // Votes: drop the source's duplicates of target votes, move the rest.
    await tx.delete(votes).where(
      and(
        eq(votes.feedbackId, source.id),
        sql`exists (select 1 from ${votes} t where t.feedback_id = ${target.id} and (
          (${votes.trackedUserId} is not null and t.tracked_user_id = ${votes.trackedUserId})
          or (${votes.trackedUserId} is null and t.tracked_user_id is null and t.visitor_id = ${votes.visitorId})
        ))`,
      ),
    );
    await tx
      .update(votes)
      .set({ feedbackId: target.id })
      .where(eq(votes.feedbackId, source.id));

    await tx.execute(sql`
      insert into ${follows} (account_id, feedback_id, tracked_user_id, created_at)
      select account_id, ${target.id}, tracked_user_id, created_at
      from ${follows} where feedback_id = ${source.id}
      on conflict do nothing`);
    await tx.delete(follows).where(eq(follows.feedbackId, source.id));

    await tx
      .update(comments)
      .set({ feedbackId: target.id })
      .where(eq(comments.feedbackId, source.id));

    await tx.execute(sql`
      insert into ${cardFeedbackLinks} (account_id, workspace_id, card_id, feedback_id, created_by, created_at)
      select account_id, workspace_id, card_id, ${target.id}, created_by, created_at
      from ${cardFeedbackLinks} where feedback_id = ${source.id}
      on conflict do nothing`);
    await tx
      .delete(cardFeedbackLinks)
      .where(eq(cardFeedbackLinks.feedbackId, source.id));

    await tx.execute(sql`
      insert into ${feedbackTags} (feedback_id, tag_id)
      select ${target.id}, tag_id from ${feedbackTags} where feedback_id = ${source.id}
      on conflict do nothing`);

    await tx
      .update(feedbackItems)
      .set({ mergedIntoId: target.id })
      .where(
        and(
          inWorkspace(feedbackItems, ctx),
          eq(feedbackItems.mergedIntoId, source.id),
        ),
      );

    const [merged] = await tx
      .update(feedbackItems)
      .set({
        importedVotes: sql`${feedbackItems.importedVotes} + ${source.importedVotes}`,
        voteCount: sql`(select count(*)::int from ${votes} where ${votes.feedbackId} = ${target.id})`,
        commentCount: sql`(select count(*)::int from ${comments} where ${comments.feedbackId} = ${target.id} and ${comments.review} = 'approved' and not ${comments.isInternal} and ${comments.deletedAt} is null)`,
        updatedAt: new Date(),
      })
      .where(eq(feedbackItems.id, target.id))
      .returning();
    await tx
      .update(feedbackItems)
      .set({
        mergedIntoId: target.id,
        archivedAt: source.archivedAt ?? new Date(),
        voteCount: 0,
        importedVotes: 0,
        commentCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(feedbackItems.id, source.id));
    return merged as FeedbackItem;
  });
}

/** A copy with the same content, status, objective and tags; no votes. */
export async function duplicateFeedback(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const item = await getFeedback(db, ctx, id);
  return db.transaction(async (tx) => {
    const copy = await insertFeedback(tx, {
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      boardId: item.boardId,
      statusId: item.statusId,
      objectiveId: item.objectiveId,
      title: `${item.title} (copy)`.slice(0, 200),
      summaryJson: item.summaryJson,
      summaryText: item.summaryText,
      isPublic: item.isPublic,
      impact: item.impact,
      effort: item.effort,
      review: "approved",
      source: "admin",
      authorUserId: ctx.userId,
    });
    await tx.execute(sql`
      insert into ${feedbackTags} (feedback_id, tag_id)
      select ${copy.id}, tag_id from ${feedbackTags} where feedback_id = ${item.id}`);
    return copy;
  });
}

/** Merge picker: other unmerged items matching `q`. */
export async function searchFeedback(
  db: Db,
  ctx: WorkspaceContext,
  q: string,
  excludeId?: string,
) {
  return db
    .select({
      id: feedbackItems.id,
      title: feedbackItems.title,
      votes: sql<number>`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`,
      boardName: feedbackBoards.name,
    })
    .from(feedbackItems)
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .where(
      and(
        inWorkspace(feedbackItems, ctx),
        isNull(feedbackItems.mergedIntoId),
        excludeId ? not(eq(feedbackItems.id, excludeId)) : undefined,
        q
          ? or(
              sql`${feedbackItems.search} @@ websearch_to_tsquery('english', ${q})`,
              ilike(feedbackItems.title, likePattern(q)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(feedbackItems.updatedAt), asc(feedbackItems.id))
    .limit(20);
}

// ── Triage (doc 20 §1 Triage inbox) ─────────────────────────────────────

/** Waiting in the inbox: pending and not archived. */
export async function inboxCount(db: DbOrTx, ctx: WorkspaceContext) {
  const [row] = await db
    .select({ n: count() })
    .from(feedbackItems)
    .where(
      and(
        inWorkspace(feedbackItems, ctx),
        eq(feedbackItems.review, "pending"),
        isNull(feedbackItems.archivedAt),
      ),
    );
  return row?.n ?? 0;
}

/** Open items per board (the list's default "open" view), for the board tabs. */
export async function boardCounts(db: DbOrTx, ctx: WorkspaceContext) {
  const rows = await db
    .select({ boardId: feedbackItems.boardId, n: count() })
    .from(feedbackItems)
    .where(
      and(
        inWorkspace(feedbackItems, ctx),
        isNull(feedbackItems.archivedAt),
        isNull(feedbackItems.completedAt),
        not(eq(feedbackItems.review, "rejected")),
      ),
    )
    .groupBy(feedbackItems.boardId);
  return Object.fromEntries(rows.map((r) => [r.boardId, r.n]));
}

/**
 * Approve publishes the item, keep private approves it for the team only,
 * reject archives it. Ids from other workspaces are ignored. Returns the
 * number of items changed.
 */
export async function reviewFeedback(
  db: Db,
  ctx: WorkspaceContext,
  ids: string[],
  action: ReviewAction,
) {
  const set: Partial<typeof feedbackItems.$inferInsert> = {
    approve: { review: "approved" as const, isPublic: true, archivedAt: null },
    keep_private: {
      review: "approved" as const,
      isPublic: false,
      archivedAt: null,
    },
    reject: { review: "rejected" as const, archivedAt: new Date() },
  }[action];
  const rows = await db
    .update(feedbackItems)
    .set({ ...set, updatedAt: new Date() })
    .where(and(inWorkspace(feedbackItems, ctx), inArray(feedbackItems.id, ids)))
    .returning({ id: feedbackItems.id });
  return rows.length;
}

/** Bulk status / objective / add tags. Returns the number of items changed. */
export async function bulkUpdateFeedback(
  db: Db,
  ctx: WorkspaceContext,
  input: z.output<typeof bulkUpdateFeedbackSchema>,
) {
  if (
    input.statusId === undefined &&
    input.objectiveId === undefined &&
    !input.addTagIds?.length
  ) {
    return 0;
  }
  const set: Partial<typeof feedbackItems.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.statusId) {
    const status = await getStatus(db, ctx, input.statusId);
    set.statusId = status.id;
    set.completedAt = status.kind === "done" ? new Date() : null;
  }
  if (input.objectiveId !== undefined) {
    if (input.objectiveId) {
      const [own] = await db
        .select({ id: objectives.id })
        .from(objectives)
        .where(
          and(
            inWorkspace(objectives, ctx),
            eq(objectives.id, input.objectiveId),
          ),
        )
        .limit(1);
      if (!own) throw new NotFoundError("Objective not found.");
    }
    set.objectiveId = input.objectiveId;
  }
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(feedbackItems)
      .set(set)
      .where(
        and(
          inWorkspace(feedbackItems, ctx),
          inArray(feedbackItems.id, input.ids),
        ),
      )
      .returning({ id: feedbackItems.id });
    const tagIds = await ownTagIds(tx, ctx, input.addTagIds ?? []);
    if (rows.length && tagIds.length) {
      await tx
        .insert(feedbackTags)
        .values(
          rows.flatMap((r) =>
            tagIds.map((tagId) => ({ feedbackId: r.id, tagId })),
          ),
        )
        .onConflictDoNothing();
    }
    return rows.length;
  });
}

// ── Admin list ──────────────────────────────────────────────────────────

export type FeedbackRow = {
  id: string;
  slug: string;
  boardId: string;
  title: string;
  summaryText: string;
  statusId: string;
  objectiveId: string | null;
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
  if (f.objectiveId) where.push(eq(feedbackItems.objectiveId, f.objectiveId));
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

  if (f.review === "pending") where.push(eq(feedbackItems.review, "pending"));

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
      objectiveId: feedbackItems.objectiveId,
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
    // Ties (same timestamp or score) keep one order across refreshes.
    .orderBy(...order, asc(feedbackItems.id))
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
