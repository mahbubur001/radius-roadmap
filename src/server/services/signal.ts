import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { cardStage, feedbackStage } from "@/lib/stages";
import type { Db } from "@/server/db/client";
import {
  feedbackItems,
  feedbackStatuses,
  roadmapCards,
  roadmapColumns,
  roadmaps,
  trackedUsers,
  updates,
  votes,
} from "@/server/db/schema";
import { pendingCommentCount } from "./comments";
import type { WorkspaceContext } from "./context";
import { RANGES, type Range } from "./events";
import { inWorkspace } from "./roadmaps";
import { cardAnnouncedSql, feedbackAnnouncedSql } from "./stages";

// The Home page (doc 30 step 3): how ideas travel from New to Announced, what
// needs the team, and the loudest requests. Every query is workspace-scoped.

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const QUARTER = 90 * DAY;
const int = (n: unknown) => Number(n ?? 0);

/** Counts per stage for the Signal line, with the period before for deltas. */
export async function signalCounts(
  db: Db,
  ctx: WorkspaceContext,
  range: Range,
  now = new Date(),
) {
  const span = RANGES[range] * DAY;
  const since = new Date(now.getTime() - span);
  const prior = new Date(since.getTime() - span);
  const announced = cardAnnouncedSql(roadmapCards.id);

  const [[ideas], [cards]] = await Promise.all([
    db
      .select({
        created: sql<number>`count(*) filter (where ${feedbackItems.createdAt} >= ${since})`,
        createdPrior: sql<number>`count(*) filter (where ${feedbackItems.createdAt} >= ${prior} and ${feedbackItems.createdAt} < ${since})`,
        review: sql<number>`count(*) filter (where ${feedbackItems.review} = 'approved' and ${feedbackStatuses.kind} = 'open' and ${feedbackItems.archivedAt} is null)`,
        untriaged: sql<number>`count(*) filter (where ${feedbackItems.review} = 'pending' and ${feedbackItems.archivedAt} is null)`,
      })
      .from(feedbackItems)
      .innerJoin(
        feedbackStatuses,
        eq(feedbackStatuses.id, feedbackItems.statusId),
      )
      .where(
        and(
          inWorkspace(feedbackItems, ctx),
          isNull(feedbackItems.mergedIntoId),
        ),
      ),
    db
      .select({
        review: sql<number>`count(*) filter (where ${roadmapCards.completedAt} is null and ${roadmapColumns.stage} = 'review')`,
        planned: sql<number>`count(*) filter (where ${roadmapCards.completedAt} is null and ${roadmapColumns.stage} = 'planned')`,
        inProgress: sql<number>`count(*) filter (where ${roadmapCards.completedAt} is null and ${roadmapColumns.stage} = 'in_progress')`,
        shipped: sql<number>`count(*) filter (where ${roadmapCards.completedAt} >= ${since})`,
        shippedPrior: sql<number>`count(*) filter (where ${roadmapCards.completedAt} >= ${prior} and ${roadmapCards.completedAt} < ${since})`,
        announced: sql<number>`count(*) filter (where ${roadmapCards.completedAt} >= ${since} and ${announced})`,
      })
      .from(roadmapCards)
      .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
      .where(
        and(inWorkspace(roadmapCards, ctx), isNull(roadmapCards.archivedAt)),
      ),
  ]);

  const shipped = int(cards?.shipped);
  const told = int(cards?.announced);
  return {
    new: { count: int(ideas?.created), prior: int(ideas?.createdPrior) },
    review: {
      count: int(ideas?.review) + int(cards?.review),
      untriaged: int(ideas?.untriaged),
    },
    planned: { count: int(cards?.planned) },
    in_progress: { count: int(cards?.inProgress) },
    shipped: { count: shipped, prior: int(cards?.shippedPrior) },
    announced: { count: told, waiting: shipped - told },
  };
}

export type SignalCounts = Awaited<ReturnType<typeof signalCounts>>;

/** Cards completed in the last 90 days that no published update mentions. */
export async function shippedNotAnnounced(
  db: Db,
  ctx: WorkspaceContext,
  now = new Date(),
) {
  return db
    .select({
      id: roadmapCards.id,
      title: roadmapCards.title,
      votes: sql<number>`${roadmapCards.voteCount} + ${roadmapCards.importedVotes}`,
      roadmapSlug: roadmaps.slug,
    })
    .from(roadmapCards)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .where(
      and(
        inWorkspace(roadmapCards, ctx),
        isNull(roadmapCards.archivedAt),
        gte(roadmapCards.completedAt, new Date(now.getTime() - QUARTER)),
        sql`not ${cardAnnouncedSql(roadmapCards.id)}`,
      ),
    )
    .orderBy(desc(roadmapCards.completedAt))
    .limit(5);
}

/** The "Needs you" queue: inbox, comments to approve, scheduled posts. */
export async function needsYou(db: Db, ctx: WorkspaceContext) {
  const [[inbox], pendingComments, [scheduled], [drafts]] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)`,
        oldestTitle: sql<
          string | null
        >`(array_agg(${feedbackItems.title} order by ${feedbackItems.createdAt}))[1]`,
        oldestAt: sql<string | null>`min(${feedbackItems.createdAt})`,
      })
      .from(feedbackItems)
      .where(
        and(
          inWorkspace(feedbackItems, ctx),
          eq(feedbackItems.review, "pending"),
          isNull(feedbackItems.archivedAt),
          isNull(feedbackItems.mergedIntoId),
        ),
      ),
    pendingCommentCount(db, ctx),
    db
      .select({
        id: updates.id,
        title: updates.title,
        publishAt: updates.publishAt,
      })
      .from(updates)
      .where(and(inWorkspace(updates, ctx), eq(updates.status, "scheduled")))
      .orderBy(asc(updates.publishAt))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)` })
      .from(updates)
      .where(and(inWorkspace(updates, ctx), eq(updates.status, "draft"))),
  ]);
  return {
    inbox: {
      count: int(inbox?.n),
      oldestTitle: inbox?.oldestTitle ?? null,
      oldestAt: inbox?.oldestAt ? new Date(inbox.oldestAt) : null,
    },
    pendingComments,
    scheduled: scheduled ?? null,
    drafts: int(drafts?.n),
  };
}

export type Loud = {
  kind: "idea" | "card";
  id: string;
  title: string;
  votes: number;
  stage: ReturnType<typeof cardStage> | null;
  /** Votes per week, oldest first (8 weeks). */
  weeks: number[];
  roadmapSlug?: string;
};

/** The most-voted open ideas and cards, with votes per week. */
export async function loudest(
  db: Db,
  ctx: WorkspaceContext,
  limit = 5,
  now = new Date(),
): Promise<Loud[]> {
  const ideaVotes = sql<number>`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`;
  const cardVotes = sql<number>`${roadmapCards.voteCount} + ${roadmapCards.importedVotes}`;
  const [ideas, cards] = await Promise.all([
    db
      .select({
        id: feedbackItems.id,
        title: feedbackItems.title,
        votes: ideaVotes,
        review: feedbackItems.review,
        kind: feedbackStatuses.kind,
        announced: feedbackAnnouncedSql(feedbackItems.id),
      })
      .from(feedbackItems)
      .innerJoin(
        feedbackStatuses,
        eq(feedbackStatuses.id, feedbackItems.statusId),
      )
      .where(
        and(
          inWorkspace(feedbackItems, ctx),
          isNull(feedbackItems.mergedIntoId),
          isNull(feedbackItems.archivedAt),
          sql`${feedbackStatuses.kind} not in ('done', 'declined')`,
          sql`${ideaVotes} > 0`,
        ),
      )
      .orderBy(desc(ideaVotes))
      .limit(limit),
    db
      .select({
        id: roadmapCards.id,
        title: roadmapCards.title,
        votes: cardVotes,
        columnStage: roadmapColumns.stage,
        roadmapSlug: roadmaps.slug,
      })
      .from(roadmapCards)
      .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
      .where(
        and(
          inWorkspace(roadmapCards, ctx),
          isNull(roadmapCards.archivedAt),
          isNull(roadmapCards.completedAt),
          sql`${cardVotes} > 0`,
        ),
      )
      .orderBy(desc(cardVotes))
      .limit(limit),
  ]);

  const top: Omit<Loud, "weeks">[] = [
    ...ideas.map((i) => ({
      kind: "idea" as const,
      id: i.id,
      title: i.title,
      votes: int(i.votes),
      stage: feedbackStage(i),
    })),
    ...cards.map((c) => ({
      kind: "card" as const,
      id: c.id,
      title: c.title,
      votes: int(c.votes),
      stage: cardStage({ completed: false, columnStage: c.columnStage }),
      roadmapSlug: c.roadmapSlug,
    })),
  ]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, limit);
  if (!top.length) return [];

  const since = new Date(now.getTime() - 8 * WEEK);
  const subject = sql<string>`coalesce(${votes.cardId}, ${votes.feedbackId})`;
  const ago = sql<number>`floor(extract(epoch from (${now}::timestamptz - ${votes.createdAt})) / ${WEEK / 1000})::int`;
  const ids = top.map((t) => t.id);
  const rows = await db
    .select({ subject, ago, n: sql<number>`count(*)` })
    .from(votes)
    .where(
      and(
        eq(votes.accountId, ctx.accountId),
        eq(votes.workspaceId, ctx.workspaceId),
        gte(votes.createdAt, since),
        sql`(${inArray(votes.cardId, ids)} or ${inArray(votes.feedbackId, ids)})`,
      ),
    )
    // By position: the parameterised expressions don't match in GROUP BY.
    .groupBy(sql`1`, sql`2`);

  return top.map((t) => {
    const weeks = Array.from({ length: 8 }, () => 0);
    for (const r of rows) {
      const a = int(r.ago);
      if (r.subject === t.id && a >= 0 && a < 8) weeks[7 - a] = int(r.n);
    }
    return { ...t, weeks };
  });
}

/** Outcome numbers: idea → shipped time, loop closed, people who voted. */
export async function outcomes(
  db: Db,
  ctx: WorkspaceContext,
  range: Range,
  now = new Date(),
) {
  const quarter = new Date(now.getTime() - QUARTER);
  const lastQuarter = new Date(now.getTime() - 2 * QUARTER);
  const since = new Date(now.getTime() - RANGES[range] * DAY);
  const days = sql`extract(epoch from (${feedbackItems.completedAt} - ${feedbackItems.createdAt})) / 86400`;

  const [[lead], [loop], [people]] = await Promise.all([
    db
      .select({
        median: sql<
          number | null
        >`percentile_cont(0.5) within group (order by ${days}) filter (where ${feedbackItems.completedAt} >= ${quarter})`,
        priorMedian: sql<
          number | null
        >`percentile_cont(0.5) within group (order by ${days}) filter (where ${feedbackItems.completedAt} >= ${lastQuarter} and ${feedbackItems.completedAt} < ${quarter})`,
      })
      .from(feedbackItems)
      .where(
        and(
          inWorkspace(feedbackItems, ctx),
          isNotNull(feedbackItems.completedAt),
          isNull(feedbackItems.mergedIntoId),
        ),
      ),
    db
      .select({
        shipped: sql<number>`count(*)`,
        announced: sql<number>`count(*) filter (where ${cardAnnouncedSql(roadmapCards.id)})`,
      })
      .from(roadmapCards)
      .where(
        and(
          inWorkspace(roadmapCards, ctx),
          isNull(roadmapCards.archivedAt),
          gte(roadmapCards.completedAt, quarter),
        ),
      ),
    db
      .select({
        voters: sql<number>`count(distinct coalesce(${votes.trackedUserId}::text, ${votes.visitorId}))`,
      })
      .from(votes)
      .where(
        and(
          eq(votes.accountId, ctx.accountId),
          eq(votes.workspaceId, ctx.workspaceId),
          gte(votes.createdAt, since),
        ),
      ),
  ]);

  const shipped = int(loop?.shipped);
  return {
    medianDays: lead?.median == null ? null : Math.round(Number(lead.median)),
    priorMedianDays:
      lead?.priorMedian == null ? null : Math.round(Number(lead.priorMedian)),
    shipped,
    announced: int(loop?.announced),
    loopClosed: shipped
      ? Math.round((int(loop?.announced) / shipped) * 100)
      : null,
    voters: int(people?.voters),
  };
}

/** Recent votes on ideas and cards, for "What happened". */
export async function recentActivity(db: Db, ctx: WorkspaceContext, limit = 8) {
  const rows = await db
    .select({
      id: votes.id,
      cardId: votes.cardId,
      feedbackId: votes.feedbackId,
      title: sql<string>`coalesce(${roadmapCards.title}, ${feedbackItems.title})`,
      roadmapSlug: roadmaps.slug,
      voterName: trackedUsers.name,
      country: votes.country,
      city: votes.city,
      createdAt: votes.createdAt,
    })
    .from(votes)
    .leftJoin(roadmapCards, eq(roadmapCards.id, votes.cardId))
    .leftJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .leftJoin(feedbackItems, eq(feedbackItems.id, votes.feedbackId))
    .leftJoin(trackedUsers, eq(trackedUsers.id, votes.trackedUserId))
    .where(
      and(
        eq(votes.accountId, ctx.accountId),
        eq(votes.workspaceId, ctx.workspaceId),
      ),
    )
    .orderBy(desc(votes.createdAt))
    .limit(limit);
  return rows;
}
