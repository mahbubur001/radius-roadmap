import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { plainToRichText, renderRichText } from "@/lib/rich-text";
import type { Db } from "@/server/db/client";
import {
  cardFeedbackLinks,
  feedbackBoards,
  feedbackItems,
  feedbackStatuses,
  feedbackTags,
  objectives,
  roadmapCards,
  roadmapColumns,
  roadmaps,
  tags,
  workspaces,
} from "@/server/db/schema";
import { likePattern } from "./cards";
import { NotFoundError, type PublicContext } from "./context";
import { insertFeedback } from "./feedback";
import { byPosition } from "./positions";

// The public "Ideas" pages (doc 20 steps 5–6, doc 22 step 4). The account
// comes from the URL, never the client. Visitors see only approved, public,
// unarchived, unmerged items on public boards of workspaces that show Ideas.

/**
 * A board the public may see: public, and its workspace hasn't switched the
 * Ideas module off. Table-qualified on purpose (see public-site.ts).
 */
export const boardIsPublic = and(
  eq(feedbackBoards.isPublic, true),
  sql`not exists (select 1 from ${workspaces} hidden where hidden.id = "feedback_boards"."workspace_id" and hidden.settings->>'showIdeas' = 'false')`,
) as SQL;

/** An item the public may see (needs a join on feedback_boards). */
const ideaIsPublic = and(
  boardIsPublic,
  eq(feedbackItems.isPublic, true),
  eq(feedbackItems.review, "approved"),
  isNull(feedbackItems.archivedAt),
  isNull(feedbackItems.mergedIntoId),
) as SQL;

export const IDEA_SORTS = ["trending", "top", "new"] as const;
export type IdeaSort = (typeof IDEA_SORTS)[number];

export type PublicIdea = {
  id: string;
  slug: string;
  boardId: string;
  title: string;
  preview: string | null;
  html: string | null;
  status: { id: string; name: string; color: string };
  objective: { name: string; color: string } | null;
  votes: number;
  comments: number;
  completed: boolean;
  createdAt: string;
};

export async function listPublicBoards(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
) {
  return db
    .select({
      id: feedbackBoards.id,
      slug: feedbackBoards.slug,
      name: feedbackBoards.name,
      description: feedbackBoards.description,
    })
    .from(feedbackBoards)
    .where(
      and(
        eq(feedbackBoards.accountId, ctx.accountId),
        eq(feedbackBoards.workspaceId, workspaceId),
        boardIsPublic,
      ),
    )
    .orderBy(byPosition(feedbackBoards.position));
}

const total = sql<number>`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`;
/** Votes in the last 30 days, then all-time votes. */
const recent = sql<number>`(select count(*) from votes v where v.feedback_id = ${feedbackItems.id} and v.created_at > now() - interval '30 days')`;

function ideaColumns() {
  return {
    id: feedbackItems.id,
    slug: feedbackItems.slug,
    boardId: feedbackItems.boardId,
    title: feedbackItems.title,
    summaryText: feedbackItems.summaryText,
    summaryJson: feedbackItems.summaryJson,
    statusId: feedbackStatuses.id,
    statusName: feedbackStatuses.name,
    statusColor: feedbackStatuses.color,
    objectiveName: objectives.name,
    objectiveColor: objectives.color,
    total,
    comments: feedbackItems.commentCount,
    completedAt: feedbackItems.completedAt,
    createdAt: feedbackItems.createdAt,
  };
}

type IdeaRow = {
  id: string;
  slug: string;
  boardId: string;
  title: string;
  summaryText: string;
  summaryJson: Record<string, unknown> | null;
  statusId: string;
  statusName: string;
  statusColor: string;
  objectiveName: string | null;
  objectiveColor: string | null;
  total: number;
  comments: number;
  completedAt: Date | null;
  createdAt: Date;
};

function toIdea(r: IdeaRow): PublicIdea {
  return {
    id: r.id,
    slug: r.slug,
    boardId: r.boardId,
    title: r.title,
    preview: r.summaryText.slice(0, 200) || null,
    html: renderRichText(r.summaryJson) || null,
    status: { id: r.statusId, name: r.statusName, color: r.statusColor },
    objective:
      r.objectiveName && r.objectiveColor
        ? { name: r.objectiveName, color: r.objectiveColor }
        : null,
    votes: Number(r.total),
    comments: r.comments,
    completed: !!r.completedAt,
    createdAt: r.createdAt.toISOString(),
  };
}

/** The Ideas page: one board's visible items, plus boards and statuses. */
export async function getPublicIdeas(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  opts: { board?: string; q?: string; sort?: IdeaSort; status?: string },
) {
  const boards = await listPublicBoards(db, ctx, workspaceId);
  const board = boards.find((b) => b.slug === opts.board) ?? boards[0];
  if (!board) return null;

  const statuses = await db
    .select({
      id: feedbackStatuses.id,
      name: feedbackStatuses.name,
      color: feedbackStatuses.color,
    })
    .from(feedbackStatuses)
    .where(
      and(
        eq(feedbackStatuses.accountId, ctx.accountId),
        eq(feedbackStatuses.workspaceId, workspaceId),
      ),
    )
    .orderBy(byPosition(feedbackStatuses.position));

  const where: SQL[] = [
    eq(feedbackItems.accountId, ctx.accountId),
    eq(feedbackItems.boardId, board.id),
    ideaIsPublic,
  ];
  if (opts.status && statuses.some((s) => s.id === opts.status)) {
    where.push(eq(feedbackItems.statusId, opts.status));
  }
  if (opts.q) {
    where.push(
      or(
        sql`${feedbackItems.search} @@ websearch_to_tsquery('english', ${opts.q})`,
        ilike(feedbackItems.title, likePattern(opts.q)),
      ) as SQL,
    );
  }
  const sort = opts.sort ?? "trending";
  const order = {
    trending: [desc(recent), desc(total), desc(feedbackItems.createdAt)],
    top: [desc(total), desc(feedbackItems.createdAt)],
    new: [desc(feedbackItems.createdAt)],
  }[sort];

  const rows = await db
    .select(ideaColumns())
    .from(feedbackItems)
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .innerJoin(
      feedbackStatuses,
      eq(feedbackStatuses.id, feedbackItems.statusId),
    )
    .leftJoin(objectives, eq(objectives.id, feedbackItems.objectiveId))
    .where(and(...where))
    .orderBy(...order, asc(feedbackItems.id))
    .limit(200);

  return { board, boards, statuses, sort, items: rows.map(toIdea) };
}

/** One visible idea with its tags and the public roadmap card it's on. */
export async function getPublicIdea(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  slug: string,
) {
  const [row] = await db
    .select(ideaColumns())
    .from(feedbackItems)
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .innerJoin(
      feedbackStatuses,
      eq(feedbackStatuses.id, feedbackItems.statusId),
    )
    .leftJoin(objectives, eq(objectives.id, feedbackItems.objectiveId))
    .where(
      and(
        eq(feedbackItems.accountId, ctx.accountId),
        eq(feedbackItems.workspaceId, workspaceId),
        eq(feedbackItems.slug, slug),
        ideaIsPublic,
      ),
    )
    .limit(1);
  if (!row) return null;

  const [tagRows, [card]] = await Promise.all([
    db
      .select({ name: tags.name })
      .from(feedbackTags)
      .innerJoin(tags, eq(tags.id, feedbackTags.tagId))
      .where(eq(feedbackTags.feedbackId, row.id)),
    // A visible card on a visible roadmap ("Planned on the roadmap").
    db
      .select({ slug: roadmapCards.slug })
      .from(cardFeedbackLinks)
      .innerJoin(roadmapCards, eq(roadmapCards.id, cardFeedbackLinks.cardId))
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
      .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
      .innerJoin(workspaces, eq(workspaces.id, roadmaps.workspaceId))
      .where(
        and(
          eq(cardFeedbackLinks.accountId, ctx.accountId),
          eq(cardFeedbackLinks.feedbackId, row.id),
          eq(roadmapCards.isPublic, true),
          isNull(roadmapCards.archivedAt),
          eq(roadmaps.isPublic, true),
          eq(roadmapColumns.isPublic, true),
          sql`coalesce(${workspaces.settings}->>'showRoadmap', 'true') <> 'false'`,
        ),
      )
      .limit(1),
  ]);
  return {
    ...toIdea(row),
    tags: tagRows.map((t) => t.name),
    roadmapCard: card?.slug ?? null,
  };
}

/** An idea a visitor may vote on, with the workspace's sign-in rule. */
export async function getVotableIdea(db: Db, ctx: PublicContext, id: string) {
  const [row] = await db
    .select({
      id: feedbackItems.id,
      workspaceId: feedbackItems.workspaceId,
      settings: workspaces.settings,
    })
    .from(feedbackItems)
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .innerJoin(workspaces, eq(workspaces.id, feedbackItems.workspaceId))
    .where(
      and(
        eq(feedbackItems.accountId, ctx.accountId),
        eq(feedbackItems.id, id),
        ideaIsPublic,
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    requireVoterLogin: !!row.settings.requireVoterLogin,
  };
}

/**
 * A visitor's submission (doc 20 D2, D6). Goes to the triage inbox unless the
 * board auto-publishes. The caller has checked sign-in, Turnstile and limits.
 */
export async function submitIdea(
  db: Db,
  ctx: PublicContext,
  input: {
    workspaceId: string;
    board: string;
    title: string;
    details: string;
    trackedUserId: string;
    source: "public" | "embed";
  },
) {
  const [board] = await db
    .select({ id: feedbackBoards.id, autoPublish: feedbackBoards.autoPublish })
    .from(feedbackBoards)
    .where(
      and(
        eq(feedbackBoards.accountId, ctx.accountId),
        eq(feedbackBoards.workspaceId, input.workspaceId),
        eq(feedbackBoards.slug, input.board),
        boardIsPublic,
      ),
    )
    .limit(1);
  if (!board) throw new NotFoundError("Board not found.");
  const [status] = await db
    .select({ id: feedbackStatuses.id })
    .from(feedbackStatuses)
    .where(
      and(
        eq(feedbackStatuses.accountId, ctx.accountId),
        eq(feedbackStatuses.workspaceId, input.workspaceId),
      ),
    )
    .orderBy(byPosition(feedbackStatuses.position))
    .limit(1);
  if (!status) throw new NotFoundError("Board not found.");

  const details = input.details.trim();
  return insertFeedback(db, {
    accountId: ctx.accountId,
    workspaceId: input.workspaceId,
    boardId: board.id,
    statusId: status.id,
    title: input.title,
    summaryJson: details ? plainToRichText(details) : null,
    summaryText: details,
    review: board.autoPublish ? "approved" : "pending",
    source: input.source,
    authorTrackedUserId: input.trackedUserId,
  });
}

/** The signed-in voter's own submissions still waiting for review. */
export async function pendingIdeas(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  trackedUserId: string,
) {
  return db
    .select({
      id: feedbackItems.id,
      boardId: feedbackItems.boardId,
      title: feedbackItems.title,
    })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.accountId, ctx.accountId),
        eq(feedbackItems.workspaceId, workspaceId),
        eq(feedbackItems.authorTrackedUserId, trackedUserId),
        eq(feedbackItems.review, "pending"),
        isNull(feedbackItems.archivedAt),
      ),
    )
    .orderBy(desc(feedbackItems.createdAt))
    .limit(20);
}

/** Does this workspace show any ideas board? */
export async function hasPublicIdeas(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
) {
  return (await listPublicBoards(db, ctx, workspaceId)).length > 0;
}

/**
 * Status of /<ws>/ideas[/<slug>] for the proxy: ok, missing, or a 308 from a
 * merged idea to the one it was merged into.
 */
export async function ideaPathStatus(
  db: Db,
  ctx: PublicContext,
  ws: string,
  slug: string | undefined,
): Promise<"ok" | "missing" | { redirect: string }> {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(eq(workspaces.accountId, ctx.accountId), eq(workspaces.slug, ws)),
    )
    .limit(1);
  if (!workspace) return "missing";
  if (!slug) {
    return (await hasPublicIdeas(db, ctx, workspace.id)) ? "ok" : "missing";
  }
  if (await getPublicIdea(db, ctx, workspace.id, slug)) return "ok";

  // Merged items point at their target (one hop; merges are repointed).
  const [merged] = await db
    .select({ target: feedbackItems.mergedIntoId })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.accountId, ctx.accountId),
        eq(feedbackItems.workspaceId, workspace.id),
        eq(feedbackItems.slug, slug),
      ),
    )
    .limit(1);
  if (!merged?.target) return "missing";
  const [target] = await db
    .select({ slug: feedbackItems.slug })
    .from(feedbackItems)
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .where(
      and(
        eq(feedbackItems.accountId, ctx.accountId),
        eq(feedbackItems.id, merged.target),
        ideaIsPublic,
      ),
    )
    .limit(1);
  return target ? { redirect: `/${ws}/ideas/${target.slug}` } : "missing";
}

/** Visible ideas for sitemap.xml. */
export async function listIdeaSitemapEntries(db: Db, ctx: PublicContext) {
  return db
    .select({
      workspace: workspaces.slug,
      idea: feedbackItems.slug,
      updatedAt: feedbackItems.updatedAt,
      indexable: sql<boolean>`coalesce((${workspaces.settings}->>'indexPublicPages')::boolean, true)`,
    })
    .from(feedbackItems)
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .innerJoin(workspaces, eq(workspaces.id, feedbackItems.workspaceId))
    .where(and(eq(feedbackItems.accountId, ctx.accountId), ideaIsPublic));
}
