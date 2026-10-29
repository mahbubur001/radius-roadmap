import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import {
  cardFeedbackLinks,
  emailSuppressions,
  feedbackBoards,
  feedbackItems,
  feedbackStatuses,
  follows,
  organization,
  trackedUsers,
  updateCards,
  updates,
  workspaces,
} from "@/server/db/schema";
import type { EmailJob } from "@/server/email/types";
import { signLink } from "@/server/internal-signature";

// Emails to people following an idea (doc 23 step 6, doc 20 D3): its status
// changed, or a published post shipped it. Only verified addresses (guests
// type theirs unchecked), never suppressed ones, only when follows are on.
// Runs in the worker: no server-only imports.

function origin() {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

/** Signed, never-expiring "stop following this idea" link. */
export function unfollowUrl(
  siteSlug: string,
  trackedUserId: string,
  feedbackId: string,
) {
  const sig = signLink(
    env.BETTER_AUTH_SECRET,
    `unfollow:${trackedUserId}:${feedbackId}`,
  );
  const url = new URL("/api/public/unfollow", origin());
  url.searchParams.set("site", siteSlug);
  url.searchParams.set("u", trackedUserId);
  url.searchParams.set("f", feedbackId);
  url.searchParams.set("sig", sig);
  return url.toString();
}

/** Verified, unsuppressed followers of some ideas. */
async function followersOf(db: Db, accountId: string, ideaIds: string[]) {
  if (!ideaIds.length) return [];
  return db
    .select({
      feedbackId: follows.feedbackId,
      trackedUserId: trackedUsers.id,
      email: sql<string>`${trackedUsers.email}`,
    })
    .from(follows)
    .innerJoin(trackedUsers, eq(trackedUsers.id, follows.trackedUserId))
    .where(
      and(
        eq(follows.accountId, accountId),
        inArray(follows.feedbackId, ideaIds),
        isNotNull(trackedUsers.email),
        isNotNull(trackedUsers.emailVerifiedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(emailSuppressions)
            .where(
              and(
                eq(emailSuppressions.accountId, accountId),
                eq(emailSuppressions.email, trackedUsers.email),
              ),
            ),
        ),
      ),
    );
}

/** Public, approved, live ideas on public boards with follows on. */
const ideaIsFollowable = and(
  eq(feedbackItems.isPublic, true),
  eq(feedbackItems.review, "approved"),
  isNull(feedbackItems.archivedAt),
  isNull(feedbackItems.mergedIntoId),
  eq(feedbackBoards.isPublic, true),
  sql`coalesce((${workspaces.settings}->>'followsEnabled')::boolean, false)`,
  sql`coalesce(${workspaces.settings}->>'showIdeas', 'true') <> 'false'`,
);

export type FollowEmail = { id: string; email: EmailJob };

/**
 * Ideas in the workspace whose status moved since followers were last told:
 * one email per follower, then the new status is recorded (also for ideas
 * nobody can be emailed about, so they don't fire later).
 */
export async function statusSweep(
  db: Db,
  workspaceId: string,
): Promise<FollowEmail[]> {
  const moved = await db
    .select({
      id: feedbackItems.id,
      accountId: feedbackItems.accountId,
      slug: feedbackItems.slug,
      title: feedbackItems.title,
      statusId: feedbackItems.statusId,
      notifiedStatusId: feedbackItems.notifiedStatusId,
      statusName: feedbackStatuses.name,
      statusColor: feedbackStatuses.color,
      wsSlug: workspaces.slug,
      siteName: organization.name,
      siteSlug: organization.slug,
      followable: sql<boolean>`(${ideaIsFollowable})`,
    })
    .from(feedbackItems)
    .innerJoin(
      feedbackStatuses,
      eq(feedbackStatuses.id, feedbackItems.statusId),
    )
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .innerJoin(workspaces, eq(workspaces.id, feedbackItems.workspaceId))
    .innerJoin(organization, eq(organization.id, feedbackItems.accountId))
    .where(
      and(
        eq(feedbackItems.workspaceId, workspaceId),
        or(
          isNull(feedbackItems.notifiedStatusId),
          sql`${feedbackItems.notifiedStatusId} <> ${feedbackItems.statusId}`,
        ),
      ),
    )
    .limit(500);

  const out: FollowEmail[] = [];
  for (const idea of moved) {
    // Unknown previous status (e.g. it was deleted): record silently.
    if (idea.notifiedStatusId && idea.followable) {
      const followers = await followersOf(db, idea.accountId, [idea.id]);
      for (const f of followers) {
        out.push({
          id: `status-${idea.id}-${idea.statusId}-${f.trackedUserId}`,
          email: {
            template: "idea-status-changed",
            to: f.email,
            props: {
              siteName: idea.siteName,
              ideaTitle: idea.title,
              status: { name: idea.statusName, color: idea.statusColor },
              url: `${origin()}/${idea.siteSlug}/${idea.wsSlug}/ideas/${idea.slug}`,
              unfollowUrl: unfollowUrl(
                idea.siteSlug ?? "",
                f.trackedUserId,
                idea.id,
              ),
            },
          },
        });
      }
    }
    // Only if it hasn't moved again meanwhile (the next sweep catches that).
    await db
      .update(feedbackItems)
      .set({ notifiedStatusId: idea.statusId })
      .where(
        and(
          eq(feedbackItems.id, idea.id),
          eq(feedbackItems.statusId, idea.statusId),
        ),
      );
  }
  return out;
}

/** Followers of ideas linked to the cards a published public post ships. */
export async function shippedEmails(
  db: Db,
  updateId: string,
): Promise<FollowEmail[]> {
  const [post] = await db
    .select({
      id: updates.id,
      title: updates.title,
      slug: updates.slug,
      wsSlug: workspaces.slug,
      siteName: organization.name,
      siteSlug: organization.slug,
    })
    .from(updates)
    .innerJoin(workspaces, eq(workspaces.id, updates.workspaceId))
    .innerJoin(organization, eq(organization.id, updates.accountId))
    .where(
      and(
        eq(updates.id, updateId),
        eq(updates.status, "published"),
        eq(updates.isPublic, true),
      ),
    )
    .limit(1);
  if (!post) return [];
  const ideas = await db
    .selectDistinct({
      id: feedbackItems.id,
      accountId: feedbackItems.accountId,
      title: feedbackItems.title,
    })
    .from(updateCards)
    .innerJoin(
      cardFeedbackLinks,
      eq(cardFeedbackLinks.cardId, updateCards.cardId),
    )
    .innerJoin(
      feedbackItems,
      eq(feedbackItems.id, cardFeedbackLinks.feedbackId),
    )
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .innerJoin(workspaces, eq(workspaces.id, feedbackItems.workspaceId))
    .where(and(eq(updateCards.updateId, post.id), ideaIsFollowable));
  const [first] = ideas;
  if (!first) return [];
  const followers = await followersOf(
    db,
    first.accountId,
    ideas.map((i) => i.id),
  );
  const postUrl = `${origin()}/${post.siteSlug}/${post.wsSlug}/updates/${post.slug}`;
  return followers.map((f) => ({
    id: `shipped-${post.id}-${f.feedbackId}-${f.trackedUserId}`,
    email: {
      template: "idea-shipped",
      to: f.email,
      props: {
        siteName: post.siteName,
        ideaTitle: ideas.find((i) => i.id === f.feedbackId)?.title ?? "",
        postTitle: post.title,
        postUrl,
        unfollowUrl: unfollowUrl(
          post.siteSlug ?? "",
          f.trackedUserId,
          f.feedbackId,
        ),
      },
    },
  }));
}
