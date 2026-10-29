import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import {
  type EventType,
  events,
  roadmapCards,
  trackedUsers,
  updateSubscribers,
  type VoteSource,
  votes,
} from "@/server/db/schema";
import type { PublicContext, WorkspaceContext } from "./context";

// Analytics v1 (doc 19 §3.7). Public pages and the vote endpoint record
// events; the Home dashboard reads them.

export type TrackInput = {
  workspaceId: string;
  type: EventType;
  subjectId?: string | null;
  visitorId?: string | null;
  country?: string | null;
  city?: string | null;
  source?: VoteSource;
};

/** Records an event. Never throws: analytics must not break a request. */
export async function trackEvent(
  db: Db,
  ctx: PublicContext,
  input: TrackInput,
) {
  try {
    await db.insert(events).values({
      accountId: ctx.accountId,
      workspaceId: input.workspaceId,
      type: input.type,
      subjectId: input.subjectId ?? null,
      visitorId: input.visitorId ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
      source: input.source ?? "public",
    });
  } catch (error) {
    console.error("[events]", error);
  }
}

export const RANGES = { "7d": 7, "1m": 30, "3m": 90 } as const;
export type Range = keyof typeof RANGES;

/** Daily page views and unique visitors for the Home chart. */
export async function viewsByDay(db: Db, ctx: WorkspaceContext, range: Range) {
  const since = new Date(Date.now() - RANGES[range] * 86_400_000);
  const day = sql<string>`to_char(date_trunc('day', ${events.createdAt}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      views: count(),
      visitors: sql<number>`count(distinct ${events.visitorId})::int`,
    })
    .from(events)
    .where(
      and(
        eq(events.accountId, ctx.accountId),
        eq(events.workspaceId, ctx.workspaceId),
        sql`${events.type} in ('page_view', 'card_view')`,
        gte(events.createdAt, since),
      ),
    )
    .groupBy(day)
    .orderBy(day);

  // Fill missing days with zeros so the chart has a continuous axis.
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; views: number; visitors: number }[] = [];
  for (let i = RANGES[range] - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    out.push({ day: d, views: r?.views ?? 0, visitors: r?.visitors ?? 0 });
  }
  return out;
}

/** Latest votes with the voter's name (if signed in) and coarse location. */
export async function recentVotes(db: Db, ctx: WorkspaceContext, limit = 10) {
  return db
    .select({
      id: votes.id,
      cardId: votes.cardId,
      cardTitle: roadmapCards.title,
      voterName: trackedUsers.name,
      country: votes.country,
      city: votes.city,
      createdAt: votes.createdAt,
    })
    .from(votes)
    .innerJoin(roadmapCards, eq(roadmapCards.id, votes.cardId))
    .leftJoin(trackedUsers, eq(trackedUsers.id, votes.trackedUserId))
    .where(
      and(
        eq(votes.accountId, ctx.accountId),
        eq(votes.workspaceId, ctx.workspaceId),
      ),
    )
    .orderBy(desc(votes.createdAt))
    .limit(limit);
}

/** Most-voted unarchived cards (real + imported votes). */
export async function topCards(db: Db, ctx: WorkspaceContext, limit = 5) {
  const total = sql<number>`${roadmapCards.voteCount} + ${roadmapCards.importedVotes}`;
  return db
    .select({
      id: roadmapCards.id,
      title: roadmapCards.title,
      votes: total,
    })
    .from(roadmapCards)
    .where(
      and(
        eq(roadmapCards.accountId, ctx.accountId),
        eq(roadmapCards.workspaceId, ctx.workspaceId),
        isNull(roadmapCards.archivedAt),
      ),
    )
    .orderBy(desc(total))
    .limit(limit);
}

/** Headline numbers for the Home stat tiles. */
export async function summary(db: Db, ctx: WorkspaceContext, range: Range) {
  const since = new Date(Date.now() - RANGES[range] * 86_400_000);
  const [[views], [voteRow], [updateRow], [subs]] = await Promise.all([
    db
      .select({
        views: count(),
        visitors: sql<number>`count(distinct ${events.visitorId})::int`,
      })
      .from(events)
      .where(
        and(
          eq(events.accountId, ctx.accountId),
          eq(events.workspaceId, ctx.workspaceId),
          sql`${events.type} in ('page_view', 'card_view')`,
          gte(events.createdAt, since),
        ),
      ),
    db
      .select({ votes: count() })
      .from(votes)
      .where(
        and(
          eq(votes.accountId, ctx.accountId),
          eq(votes.workspaceId, ctx.workspaceId),
          gte(votes.createdAt, since),
        ),
      ),
    // Phase 4 (doc 23): post views and reactions in the period.
    db
      .select({
        postViews: sql<number>`count(*) filter (where ${events.type} = 'update_view')::int`,
        reactions: sql<number>`count(*) filter (where ${events.type} = 'reaction')::int`,
      })
      .from(events)
      .where(
        and(
          eq(events.accountId, ctx.accountId),
          eq(events.workspaceId, ctx.workspaceId),
          gte(events.createdAt, since),
        ),
      ),
    // Subscribers is a running total, not per period.
    db
      .select({ n: count() })
      .from(updateSubscribers)
      .where(
        and(
          eq(updateSubscribers.accountId, ctx.accountId),
          eq(updateSubscribers.workspaceId, ctx.workspaceId),
          eq(updateSubscribers.status, "active"),
        ),
      ),
  ]);
  return {
    views: views?.views ?? 0,
    visitors: views?.visitors ?? 0,
    votes: voteRow?.votes ?? 0,
    postViews: updateRow?.postViews ?? 0,
    reactions: updateRow?.reactions ?? 0,
    subscribers: subs?.n ?? 0,
  };
}
