import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  roadmapCards,
  trackedUsers,
  type VoteSource,
  votes,
} from "@/server/db/schema";
import { getCard } from "./cards";
import type { PublicContext, WorkspaceContext } from "./context";

// Votes (doc 19 §3.6, §4.3). One row per voter per card: tracked users by
// tracked_user_id, anonymous visitors by visitor_id. roadmap_cards.vote_count
// is kept equal to the number of rows in the same transaction.

export type Voter =
  | { trackedUserId: string; visitorId?: string | null }
  | { trackedUserId?: null; visitorId: string };

export type VoteMeta = {
  ipHash: string | null;
  country: string | null;
  city: string | null;
  source: VoteSource;
};

function voterWhere(cardId: string, voter: Voter) {
  return voter.trackedUserId
    ? and(
        eq(votes.cardId, cardId),
        eq(votes.trackedUserId, voter.trackedUserId),
      )
    : and(
        eq(votes.cardId, cardId),
        isNull(votes.trackedUserId),
        eq(votes.visitorId, voter.visitorId ?? ""),
      );
}

async function bump(tx: DbOrTx, cardId: string, by: number) {
  const [row] = await tx
    .update(roadmapCards)
    .set({ voteCount: sql`greatest(${roadmapCards.voteCount} + ${by}, 0)` })
    .where(eq(roadmapCards.id, cardId))
    .returning({
      voteCount: roadmapCards.voteCount,
      importedVotes: roadmapCards.importedVotes,
    });
  return (row?.voteCount ?? 0) + (row?.importedVotes ?? 0);
}

/**
 * Vote, or remove the vote when this voter already voted. The caller has
 * already checked the card is public and votable for `ctx` (public-site.ts).
 */
export async function toggleVote(
  db: Db,
  ctx: PublicContext,
  card: { id: string; workspaceId: string },
  voter: Voter,
  meta: VoteMeta,
): Promise<{ voted: boolean; total: number }> {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(votes)
      .where(
        and(eq(votes.accountId, ctx.accountId), voterWhere(card.id, voter)),
      )
      .returning({ id: votes.id });
    if (removed) return { voted: false, total: await bump(tx, card.id, -1) };

    const [added] = await tx
      .insert(votes)
      .values({
        accountId: ctx.accountId,
        workspaceId: card.workspaceId,
        cardId: card.id,
        trackedUserId: voter.trackedUserId ?? null,
        visitorId: voter.visitorId ?? null,
        ...meta,
      })
      .onConflictDoNothing()
      .returning({ id: votes.id });
    return { voted: true, total: await bump(tx, card.id, added ? 1 : 0) };
  });
}

/** Card ids (among `cardIds`) this voter has voted for. */
export async function votedCardIds(
  db: Db,
  ctx: PublicContext,
  voter: { trackedUserId?: string | null; visitorId?: string | null },
  workspaceId: string,
) {
  if (!voter.trackedUserId && !voter.visitorId) return [];
  const rows = await db
    .select({ cardId: votes.cardId })
    .from(votes)
    .where(
      and(
        eq(votes.accountId, ctx.accountId),
        eq(votes.workspaceId, workspaceId),
        voter.trackedUserId
          ? eq(votes.trackedUserId, voter.trackedUserId)
          : and(
              isNull(votes.trackedUserId),
              eq(votes.visitorId, voter.visitorId ?? ""),
            ),
      ),
    );
  return rows.map((r) => r.cardId);
}

/**
 * On sign-in, the visitor's anonymous votes become the voter's. Where the
 * voter had already voted the same card, the anonymous duplicate is dropped.
 */
export async function claimVisitorVotes(
  db: Db,
  ctx: PublicContext,
  visitorId: string,
  trackedUserId: string,
) {
  await db.transaction(async (tx) => {
    const anonymous = and(
      eq(votes.accountId, ctx.accountId),
      isNull(votes.trackedUserId),
      eq(votes.visitorId, visitorId),
    );
    const already = tx
      .select({ cardId: votes.cardId })
      .from(votes)
      .where(
        and(
          eq(votes.accountId, ctx.accountId),
          eq(votes.trackedUserId, trackedUserId),
        ),
      );
    const dropped = await tx
      .delete(votes)
      .where(and(anonymous, inArray(votes.cardId, already)))
      .returning({ cardId: votes.cardId });
    for (const { cardId } of dropped) await bump(tx, cardId, -1);
    await tx.update(votes).set({ trackedUserId }).where(anonymous);
  });
}

/** Admin "Votes" tab: named voters plus the anonymous count. */
export async function listVoters(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
) {
  const card = await getCard(db, ctx, cardId);
  const scope = and(
    eq(votes.accountId, ctx.accountId),
    eq(votes.workspaceId, ctx.workspaceId),
    eq(votes.cardId, card.id),
  );
  const [named, [anon]] = await Promise.all([
    db
      .select({
        id: votes.id,
        name: trackedUsers.name,
        email: trackedUsers.email,
        kind: trackedUsers.kind,
        country: votes.country,
        city: votes.city,
        createdAt: votes.createdAt,
      })
      .from(votes)
      .innerJoin(trackedUsers, eq(trackedUsers.id, votes.trackedUserId))
      .where(scope)
      .orderBy(desc(votes.createdAt)),
    db
      .select({ n: count() })
      .from(votes)
      .where(and(scope, isNull(votes.trackedUserId))),
  ]);
  return {
    named,
    anonymous: anon?.n ?? 0,
    imported: card.importedVotes,
  };
}
