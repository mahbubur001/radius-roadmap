import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { ReactionCounts, ReactionKey } from "@/lib/reactions";
import type { Db } from "@/server/db/client";
import { updateReactions, updates } from "@/server/db/schema";
import type { PublicContext } from "./context";
import type { Voter } from "./votes";

// Emoji reactions on public posts (doc 23 U4): one of each emoji per voter
// (logged-in voter, or the anonymous visitor id), toggled.

function voterWhere(voter: Voter) {
  return voter.trackedUserId
    ? eq(updateReactions.trackedUserId, voter.trackedUserId)
    : and(
        isNull(updateReactions.trackedUserId),
        eq(updateReactions.visitorId, voter.visitorId ?? ""),
      );
}

export async function toggleReaction(
  db: Db,
  ctx: PublicContext,
  updateId: string,
  emoji: ReactionKey,
  voter: Voter,
) {
  return db.transaction(async (tx) => {
    const where = and(
      eq(updateReactions.accountId, ctx.accountId),
      eq(updateReactions.updateId, updateId),
      eq(updateReactions.emoji, emoji),
      voterWhere(voter),
    );
    const [removed] = await tx
      .delete(updateReactions)
      .where(where)
      .returning({ id: updateReactions.id });
    if (!removed) {
      await tx
        .insert(updateReactions)
        .values({
          accountId: ctx.accountId,
          updateId,
          emoji,
          trackedUserId: voter.trackedUserId ?? null,
          visitorId: voter.visitorId ?? null,
        })
        .onConflictDoNothing();
    }
    const [total] = await tx
      .select({ n: count() })
      .from(updateReactions)
      .where(
        and(
          eq(updateReactions.updateId, updateId),
          eq(updateReactions.emoji, emoji),
        ),
      );
    return { reacted: !removed, count: total?.n ?? 0 };
  });
}

/** Counts per emoji for some posts. */
export async function reactionCounts(
  db: Db,
  ctx: PublicContext,
  updateIds: string[],
): Promise<Record<string, ReactionCounts>> {
  if (!updateIds.length) return {};
  const rows = await db
    .select({
      updateId: updateReactions.updateId,
      emoji: updateReactions.emoji,
      n: count(),
    })
    .from(updateReactions)
    .where(
      and(
        eq(updateReactions.accountId, ctx.accountId),
        inArray(updateReactions.updateId, updateIds),
      ),
    )
    .groupBy(updateReactions.updateId, updateReactions.emoji);
  const out: Record<string, ReactionCounts> = {};
  for (const r of rows) {
    out[r.updateId] = { ...out[r.updateId], [r.emoji]: r.n };
  }
  return out;
}

/** "<updateId>:<emoji>" for every reaction of this voter in a workspace. */
export async function myReactions(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  voter: Voter,
) {
  const rows = await db
    .select({
      updateId: updateReactions.updateId,
      emoji: updateReactions.emoji,
    })
    .from(updateReactions)
    .innerJoin(updates, eq(updates.id, updateReactions.updateId))
    .where(
      and(
        eq(updateReactions.accountId, ctx.accountId),
        eq(updates.workspaceId, workspaceId),
        voterWhere(voter),
      ),
    );
  return rows.map((r) => `${r.updateId}:${r.emoji}`);
}
