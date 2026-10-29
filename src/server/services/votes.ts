import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  feedbackItems,
  roadmapCards,
  trackedUsers,
  user,
  type VoteSource,
  votes,
} from "@/server/db/schema";
import { getCard } from "./cards";
import {
  NotFoundError,
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import { getFeedback } from "./feedback";

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

function voterWhere(target: SQL | undefined, voter: Voter) {
  return voter.trackedUserId
    ? and(target, eq(votes.trackedUserId, voter.trackedUserId))
    : and(
        target,
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

async function bumpFeedback(tx: DbOrTx, feedbackId: string, by: number) {
  const [row] = await tx
    .update(feedbackItems)
    .set({ voteCount: sql`greatest(${feedbackItems.voteCount} + ${by}, 0)` })
    .where(eq(feedbackItems.id, feedbackId))
    .returning({
      voteCount: feedbackItems.voteCount,
      importedVotes: feedbackItems.importedVotes,
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
        and(
          eq(votes.accountId, ctx.accountId),
          voterWhere(eq(votes.cardId, card.id), voter),
        ),
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

/**
 * Same as toggleVote, for a public idea (doc 20 D1: one votes table). The
 * caller has already checked the idea is visible (public-ideas.ts).
 */
export async function toggleFeedbackVote(
  db: Db,
  ctx: PublicContext,
  item: { id: string; workspaceId: string },
  voter: Voter,
  meta: VoteMeta,
): Promise<{ voted: boolean; total: number }> {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(votes)
      .where(
        and(
          eq(votes.accountId, ctx.accountId),
          voterWhere(eq(votes.feedbackId, item.id), voter),
        ),
      )
      .returning({ id: votes.id });
    if (removed) {
      return { voted: false, total: await bumpFeedback(tx, item.id, -1) };
    }
    const [added] = await tx
      .insert(votes)
      .values({
        accountId: ctx.accountId,
        workspaceId: item.workspaceId,
        feedbackId: item.id,
        trackedUserId: voter.trackedUserId ?? null,
        visitorId: voter.visitorId ?? null,
        ...meta,
      })
      .onConflictDoNothing()
      .returning({ id: votes.id });
    return {
      voted: true,
      total: await bumpFeedback(tx, item.id, added ? 1 : 0),
    };
  });
}

/** Card and idea ids in a workspace this voter has voted for. */
export async function votedIds(
  db: Db,
  ctx: PublicContext,
  voter: { trackedUserId?: string | null; visitorId?: string | null },
  workspaceId: string,
) {
  if (!voter.trackedUserId && !voter.visitorId) return [];
  const rows = await db
    .select({ cardId: votes.cardId, feedbackId: votes.feedbackId })
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
  return rows.flatMap((r) => {
    const id = r.cardId ?? r.feedbackId;
    return id ? [id] : [];
  });
}

/**
 * On sign-in, the visitor's anonymous votes become the voter's. Where the
 * voter had already voted the same card or feedback item, the anonymous
 * duplicate is dropped.
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
    const own = and(
      eq(votes.accountId, ctx.accountId),
      eq(votes.trackedUserId, trackedUserId),
    );
    const cards = tx
      .select({ id: votes.cardId })
      .from(votes)
      .where(and(own, isNotNull(votes.cardId)));
    const feedback = tx
      .select({ id: votes.feedbackId })
      .from(votes)
      .where(and(own, isNotNull(votes.feedbackId)));
    const droppedCards = await tx
      .delete(votes)
      .where(and(anonymous, inArray(votes.cardId, cards)))
      .returning({ cardId: votes.cardId });
    const droppedFeedback = await tx
      .delete(votes)
      .where(and(anonymous, inArray(votes.feedbackId, feedback)))
      .returning({ feedbackId: votes.feedbackId });
    for (const { cardId } of droppedCards) {
      if (cardId) await bump(tx, cardId, -1);
    }
    for (const { feedbackId } of droppedFeedback) {
      if (feedbackId) await bumpFeedback(tx, feedbackId, -1);
    }
    await tx.update(votes).set({ trackedUserId }).where(anonymous);
  });
}

/** Admin "Votes" tab: named voters plus the anonymous count. */
async function voters(db: Db, scope: SQL | undefined, imported: number) {
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
  return { named, anonymous: anon?.n ?? 0, imported };
}

export async function listVoters(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
) {
  const card = await getCard(db, ctx, cardId);
  return voters(
    db,
    and(
      eq(votes.accountId, ctx.accountId),
      eq(votes.workspaceId, ctx.workspaceId),
      eq(votes.cardId, card.id),
    ),
    card.importedVotes,
  );
}

export async function listFeedbackVoters(
  db: Db,
  ctx: WorkspaceContext,
  feedbackId: string,
) {
  const item = await getFeedback(db, ctx, feedbackId);
  return voters(
    db,
    and(
      eq(votes.accountId, ctx.accountId),
      eq(votes.workspaceId, ctx.workspaceId),
      eq(votes.feedbackId, item.id),
    ),
    item.importedVotes,
  );
}

// ── Team votes from the dashboard (LoopedIn's clickable vote box) ───────

/**
 * The account's voter record for the signed-in team member, by their
 * (verified) email, so a vote from the dashboard and one from the public site
 * are the same vote.
 */
export async function teamVoterId(db: Db, ctx: WorkspaceContext) {
  const [me] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, ctx.userId))
    .limit(1);
  if (!me) throw new NotFoundError("User not found.");
  const email = me.email.trim().toLowerCase();
  const [row] = await db
    .insert(trackedUsers)
    .values({
      accountId: ctx.accountId,
      kind: "email",
      email,
      name: me.name,
      emailVerifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [trackedUsers.accountId, trackedUsers.email],
      targetWhere: isNotNull(trackedUsers.email),
      set: { lastSeenAt: new Date() },
    })
    .returning({ id: trackedUsers.id });
  if (!row) throw new Error("Failed to find the voter.");
  return row.id;
}

const ADMIN_META = {
  ipHash: null,
  country: null,
  city: null,
  source: "admin",
} as const;

/** Toggle the team member's own vote on a card in their workspace. */
export async function toggleTeamCardVote(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
) {
  const card = await getCard(db, ctx, cardId);
  const trackedUserId = await teamVoterId(db, ctx);
  return toggleVote(
    db,
    ctx,
    { id: card.id, workspaceId: card.workspaceId },
    { trackedUserId },
    ADMIN_META,
  );
}

/** Has the team member voted on this card (from anywhere)? */
export async function hasTeamCardVote(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
) {
  const [row] = await db
    .select({ id: votes.id })
    .from(votes)
    .innerJoin(trackedUsers, eq(trackedUsers.id, votes.trackedUserId))
    .innerJoin(user, eq(user.id, ctx.userId))
    .where(
      and(
        eq(votes.accountId, ctx.accountId),
        eq(votes.cardId, cardId),
        eq(trackedUsers.email, sql`lower(${user.email})`),
      ),
    )
    .limit(1);
  return !!row;
}
