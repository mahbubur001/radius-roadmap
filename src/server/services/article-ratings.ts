import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { ArticleRating } from "@/lib/schemas/articles";
import type { Db } from "@/server/db/client";
import { articleRatings, articles } from "@/server/db/schema";
import type { PublicContext } from "./context";
import type { Voter } from "./votes";

// "Was this helpful?" on public articles (doc 25 A4): one rating per voter
// (logged-in voter, or the anonymous visitor id), changeable or removable.
// Counts are cached on the article in the same transaction.

function voterWhere(voter: Voter) {
  return voter.trackedUserId
    ? eq(articleRatings.trackedUserId, voter.trackedUserId)
    : and(
        isNull(articleRatings.trackedUserId),
        eq(articleRatings.visitorId, voter.visitorId ?? ""),
      );
}

const column = {
  like: "likes",
  neutral: "neutrals",
  dislike: "dislikes",
} as const;

/** Set (or with null, clear) this voter's rating. Returns the new counts. */
export async function rateArticle(
  db: Db,
  ctx: PublicContext,
  articleId: string,
  value: ArticleRating | null,
  voter: Voter,
) {
  return db.transaction(async (tx) => {
    const where = and(
      eq(articleRatings.accountId, ctx.accountId),
      eq(articleRatings.articleId, articleId),
      voterWhere(voter),
    );
    const [previous] = await tx
      .delete(articleRatings)
      .where(where)
      .returning({ value: articleRatings.value });
    if (value) {
      await tx.insert(articleRatings).values({
        accountId: ctx.accountId,
        articleId,
        value,
        trackedUserId: voter.trackedUserId ?? null,
        visitorId: voter.visitorId ?? null,
      });
    }
    const change: Partial<Record<(typeof column)[ArticleRating], SQL>> = {};
    if (previous?.value !== value) {
      if (previous) {
        const c = column[previous.value];
        change[c] = sql`greatest(${articles[c]} - 1, 0)`;
      }
      if (value) change[column[value]] = sql`${articles[column[value]]} + 1`;
    }
    const [row] = await tx
      .update(articles)
      // A rating isn't an edit: keep the article's "Updated" date.
      .set({ ...change, updatedAt: sql`${articles.updatedAt}` })
      .where(
        and(eq(articles.accountId, ctx.accountId), eq(articles.id, articleId)),
      )
      .returning({
        like: articles.likes,
        neutral: articles.neutrals,
        dislike: articles.dislikes,
      });
    return { value, ratings: row ?? { like: 0, neutral: 0, dislike: 0 } };
  });
}

/** articleId → this voter's rating, for the articles of a workspace. */
export async function myArticleRatings(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  voter: Voter,
) {
  const rows = await db
    .select({
      articleId: articleRatings.articleId,
      value: articleRatings.value,
    })
    .from(articleRatings)
    .innerJoin(articles, eq(articles.id, articleRatings.articleId))
    .where(
      and(
        eq(articleRatings.accountId, ctx.accountId),
        eq(articles.workspaceId, workspaceId),
        voterWhere(voter),
      ),
    );
  return Object.fromEntries(rows.map((r) => [r.articleId, r.value])) as Record<
    string,
    ArticleRating
  >;
}
