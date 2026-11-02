import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { cardStage, feedbackStage } from "@/lib/stages";
import type { Db } from "@/server/db/client";
import {
  articles,
  feedbackItems,
  feedbackStatuses,
  roadmapCards,
  roadmapColumns,
  roadmaps,
} from "@/server/db/schema";
import { likePattern } from "./cards";
import type { WorkspaceContext } from "./context";
import { inWorkspace } from "./roadmaps";
import { cardAnnouncedSql, feedbackAnnouncedSql } from "./stages";

const PER_KIND = 6;

/** Full-text match on a generated `search` column, or a title substring. */
function matches(search: AnyPgColumn, title: AnyPgColumn, q: string) {
  return or(
    sql`${search} @@ websearch_to_tsquery('english', ${q})`,
    ilike(title, likePattern(q)),
  );
}

/** ⌘K: the workspace's ideas, roadmap cards and articles matching `q`. */
export async function quickSearch(db: Db, ctx: WorkspaceContext, q: string) {
  const [ideas, cards, docs] = await Promise.all([
    db
      .select({
        id: feedbackItems.id,
        title: feedbackItems.title,
        votes: sql<number>`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`,
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
          matches(feedbackItems.search, feedbackItems.title, q),
        ),
      )
      .orderBy(desc(feedbackItems.voteCount), desc(feedbackItems.updatedAt))
      .limit(PER_KIND),
    db
      .select({
        id: roadmapCards.id,
        title: roadmapCards.title,
        votes: roadmapCards.voteCount,
        roadmapSlug: roadmaps.slug,
        roadmapName: roadmaps.internalTitle,
        completedAt: roadmapCards.completedAt,
        columnStage: roadmapColumns.stage,
        announced: cardAnnouncedSql(roadmapCards.id),
      })
      .from(roadmapCards)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
      .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
      .where(
        and(
          inWorkspace(roadmapCards, ctx),
          isNull(roadmapCards.archivedAt),
          matches(roadmapCards.search, roadmapCards.title, q),
        ),
      )
      .orderBy(desc(roadmapCards.voteCount), desc(roadmapCards.updatedAt))
      .limit(PER_KIND),
    db
      .select({
        id: articles.id,
        title: articles.title,
        status: articles.status,
      })
      .from(articles)
      .where(
        and(
          inWorkspace(articles, ctx),
          matches(articles.search, articles.title, q),
        ),
      )
      .orderBy(desc(articles.updatedAt))
      .limit(PER_KIND),
  ]);
  return {
    ideas: ideas.map(({ review, kind, announced, ...i }) => ({
      ...i,
      stage: feedbackStage({ review, kind, announced }),
    })),
    cards: cards.map(({ completedAt, columnStage, announced, ...c }) => ({
      ...c,
      stage: cardStage({ completed: !!completedAt, columnStage, announced }),
    })),
    articles: docs,
  };
}

export type QuickSearchResult = Awaited<ReturnType<typeof quickSearch>>;
