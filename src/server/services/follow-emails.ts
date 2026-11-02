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
import { wsSegment } from "@/lib/public-path";
import type { Db } from "@/server/db/client";
import {
  cardFeedbackLinks,
  emailSuppressions,
  feedbackBoards,
  feedbackItems,
  feedbackStatuses,
  follows,
  organization,
  roadmapCards,
  trackedUsers,
  updateCards,
  updates,
  votes,
  workspaces,
} from "@/server/db/schema";
import type { EmailBrand, EmailJob } from "@/server/email/types";
import { signLink } from "@/server/internal-signature";
import { getEmailBrand } from "./branding";
import { publicSiteBase } from "./custom-domains";
import { defaultWorkspaceSlug } from "./default-workspace";

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
      defaultWs: defaultWorkspaceSlug('"workspaces"."account_id"'),
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
  // One workspace, so one account: its branding is looked up once.
  let brand: EmailBrand | undefined;
  let siteBase = "";
  for (const idea of moved) {
    // Unknown previous status (e.g. it was deleted): record silently.
    if (idea.notifiedStatusId && idea.followable) {
      const followers = await followersOf(db, idea.accountId, [idea.id]);
      if (followers.length && !siteBase) {
        brand = await getEmailBrand(db, idea.accountId);
        siteBase = await publicSiteBase(db, idea.accountId, idea.siteSlug);
      }
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
              url: `${siteBase}${wsSegment(idea.wsSlug, idea.defaultWs)}/ideas/${idea.slug}`,
              unfollowUrl: unfollowUrl(
                idea.siteSlug ?? "",
                f.trackedUserId,
                idea.id,
              ),
              brand,
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

/** Signed, never-expiring "stop all emails from this site" link for voters. */
export function optOutUrl(siteSlug: string, trackedUserId: string) {
  const sig = signLink(env.BETTER_AUTH_SECRET, `optout:${trackedUserId}`);
  const url = new URL("/api/public/optout", origin());
  url.searchParams.set("site", siteSlug);
  url.searchParams.set("u", trackedUserId);
  url.searchParams.set("sig", sig);
  return url.toString();
}

/** Verified, not suppressed email of a tracked user (voters, followers). */
const reachable = (accountId: string, db: Db) =>
  and(
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
  );

/**
 * A published public post shipped some cards: followers of the linked ideas
 * hear about it (doc 23 step 6), and, unless the post turns it off, so do the
 * people who voted on those cards or ideas (doc 30 R4). One email per person.
 */
export async function shippedEmails(
  db: Db,
  updateId: string,
): Promise<FollowEmail[]> {
  const [post] = await db
    .select({
      id: updates.id,
      accountId: updates.accountId,
      title: updates.title,
      slug: updates.slug,
      notifyVoters: updates.notifyVoters,
      wsSlug: workspaces.slug,
      siteName: organization.name,
      siteSlug: organization.slug,
      defaultWs: defaultWorkspaceSlug('"workspaces"."account_id"'),
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
      title: feedbackItems.title,
      followable: sql<boolean>`(${ideaIsFollowable})`,
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
    .where(
      and(
        eq(updateCards.updateId, post.id),
        eq(feedbackItems.isPublic, true),
        eq(feedbackItems.review, "approved"),
        isNull(feedbackItems.mergedIntoId),
      ),
    );
  const followers = await followersOf(
    db,
    post.accountId,
    ideas.filter((i) => i.followable).map((i) => i.id),
  );

  type Voter = { trackedUserId: string; email: string; title: string };
  let voters: Voter[] = [];
  if (post.notifyVoters) {
    const ideaIds = ideas.map((i) => i.id);
    const [ideaVoters, cardVoters] = await Promise.all([
      ideaIds.length
        ? db
            .selectDistinct({
              trackedUserId: trackedUsers.id,
              email: sql<string>`${trackedUsers.email}`,
              title: feedbackItems.title,
            })
            .from(votes)
            .innerJoin(trackedUsers, eq(trackedUsers.id, votes.trackedUserId))
            .innerJoin(feedbackItems, eq(feedbackItems.id, votes.feedbackId))
            .where(
              and(
                eq(votes.accountId, post.accountId),
                inArray(votes.feedbackId, ideaIds),
                reachable(post.accountId, db),
              ),
            )
        : [],
      db
        .selectDistinct({
          trackedUserId: trackedUsers.id,
          email: sql<string>`${trackedUsers.email}`,
          title: sql<string>`coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title})`,
        })
        .from(updateCards)
        .innerJoin(roadmapCards, eq(roadmapCards.id, updateCards.cardId))
        .innerJoin(votes, eq(votes.cardId, roadmapCards.id))
        .innerJoin(trackedUsers, eq(trackedUsers.id, votes.trackedUserId))
        .where(
          and(
            eq(updateCards.updateId, post.id),
            eq(roadmapCards.isPublic, true),
            eq(votes.accountId, post.accountId),
            reachable(post.accountId, db),
          ),
        ),
    ]);
    const seen = new Set(followers.map((f) => f.trackedUserId));
    for (const v of [...cardVoters, ...ideaVoters]) {
      if (seen.has(v.trackedUserId)) continue;
      seen.add(v.trackedUserId);
      voters.push(v);
    }
  }
  if (!followers.length && !voters.length) return [];

  const brand = await getEmailBrand(db, post.accountId);
  const siteBase = await publicSiteBase(db, post.accountId, post.siteSlug);
  const postUrl = `${siteBase}${wsSegment(post.wsSlug, post.defaultWs)}/updates/${post.slug}`;
  // One email per person: a follower of two shipped ideas hears once.
  const told = new Set<string>();
  const out: FollowEmail[] = [];
  for (const f of followers) {
    if (told.has(f.trackedUserId)) continue;
    told.add(f.trackedUserId);
    out.push({
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
          brand,
        },
      },
    });
  }
  voters = voters.filter((v) => !told.has(v.trackedUserId));
  for (const v of voters) {
    out.push({
      id: `voted-shipped-${post.id}-${v.trackedUserId}`,
      email: {
        template: "voted-shipped",
        to: v.email,
        props: {
          siteName: post.siteName,
          itemTitle: v.title,
          postTitle: post.title,
          postUrl,
          optOutUrl: optOutUrl(post.siteSlug ?? "", v.trackedUserId),
          brand,
        },
      },
    });
  }
  return out;
}
