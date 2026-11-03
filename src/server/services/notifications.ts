import {
  and,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { env } from "@/lib/env";
import {
  type AlertKind,
  type Frequency,
  type NotificationPrefs,
  notificationPrefsSchema,
} from "@/lib/schemas/notifications";
import type { Db } from "@/server/db/client";
import {
  comments,
  feedbackItems,
  member,
  notificationPreferences,
  roadmapCards,
  roadmaps,
  trackedUsers,
  updateSubscribers,
  user,
  voteMilestones,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema";
import type { EmailJob } from "@/server/email/types";
import { type Role, toRole, type WorkspaceContext } from "./context";

// Team email alerts (doc 20 §1 Notifications, step 8): new ideas and new
// comments, per member and workspace: instant, a daily digest, or off. No
// row means the role default: owners and admins instant, members off. Runs
// in the worker (no request context), so everything is looked up by id and
// scoped by the item's own account and workspace.

export function defaultPrefs(role: Role): NotificationPrefs {
  const lead = role !== "member";
  return {
    newFeedback: lead ? "instant" : "off",
    newComment: lead ? "instant" : "off",
    newSubscriber: "off",
    // Doc 33: milestones, the review reminder and the weekly summary for
    // owners and admins; replies to your own comments for everyone.
    votes: lead ? "instant" : "off",
    reviewReminder: lead ? "daily" : "off",
    replies: "instant",
    weeklySummary: lead ? "weekly" : "off",
  };
}

/** A saved row: null columns (added later, doc 33) take the role default. */
function withDefaults(
  role: Role,
  row: Partial<Record<AlertKind, Frequency | null>> | undefined,
): NotificationPrefs {
  const base = defaultPrefs(role);
  if (!row) return base;
  return {
    newFeedback: row.newFeedback ?? base.newFeedback,
    newComment: row.newComment ?? base.newComment,
    newSubscriber: row.newSubscriber ?? base.newSubscriber,
    votes: row.votes ?? base.votes,
    reviewReminder: (row.reviewReminder ??
      base.reviewReminder) as NotificationPrefs["reviewReminder"],
    replies: row.replies ?? base.replies,
    weeklySummary: (row.weeklySummary ??
      base.weeklySummary) as NotificationPrefs["weeklySummary"],
  };
}

export async function getMyPrefs(db: Db, ctx: WorkspaceContext) {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, ctx.userId),
        eq(notificationPreferences.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  return withDefaults(ctx.role, row);
}

export async function setMyPrefs(
  db: Db,
  ctx: WorkspaceContext,
  input: NotificationPrefs,
) {
  const data = notificationPrefsSchema.parse(input);
  await db
    .insert(notificationPreferences)
    .values({
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      ...data,
    })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.userId,
        notificationPreferences.workspaceId,
      ],
      set: data,
    });
}

type Kind = AlertKind;

/**
 * Team members of the account who can see the workspace (owners and admins
 * all; members only when granted) and whose setting for `kind` is `freq`.
 */
export async function recipients(
  db: Db,
  scope: { accountId: string; workspaceId: string },
  kind: Kind,
  freq: Frequency,
) {
  return (await teamPrefs(db, scope)).filter((r) => r.prefs[kind] === freq);
}

/** Everyone who can see the workspace, with their alert settings. */
export async function teamPrefs(
  db: Db,
  scope: { accountId: string; workspaceId: string },
) {
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: member.role,
      newFeedback: notificationPreferences.newFeedback,
      newComment: notificationPreferences.newComment,
      newSubscriber: notificationPreferences.newSubscriber,
      votes: notificationPreferences.votes,
      reviewReminder: notificationPreferences.reviewReminder,
      replies: notificationPreferences.replies,
      weeklySummary: notificationPreferences.weeklySummary,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(
      notificationPreferences,
      and(
        eq(notificationPreferences.userId, member.userId),
        eq(notificationPreferences.workspaceId, scope.workspaceId),
      ),
    )
    .where(
      and(
        eq(member.organizationId, scope.accountId),
        or(
          inArray(member.role, ["owner", "admin"]),
          exists(
            db
              .select({ one: sql`1` })
              .from(workspaceMembers)
              .where(
                and(
                  eq(workspaceMembers.accountId, scope.accountId),
                  eq(workspaceMembers.workspaceId, scope.workspaceId),
                  eq(workspaceMembers.userId, member.userId),
                ),
              ),
          ),
        ) as SQL,
      ),
    );
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    prefs: withDefaults(toRole(r.role), r),
  }));
}

export function origin() {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

export function excerpt(text: string, max = 240) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function links(workspaceSlug: string) {
  const base = `${origin()}/dashboard/${workspaceSlug}`;
  return {
    base,
    settings: `${base}/settings/notifications`,
    idea: (id: string, pending: boolean) =>
      pending
        ? `${base}/feedback/inbox?feedback=${id}`
        : `${base}/feedback?state=all&feedback=${id}`,
    card: (roadmap: string, id: string) =>
      `${base}/roadmap?r=${roadmap}&card=${id}`,
    comments: `${base}/feedback/comments`,
  };
}

/** One email per member who wants instant alerts; the author is skipped. */
export async function newFeedbackEmails(
  db: Db,
  feedbackId: string,
): Promise<(EmailJob & { userId: string })[]> {
  const [item] = await db
    .select({
      id: feedbackItems.id,
      accountId: feedbackItems.accountId,
      workspaceId: feedbackItems.workspaceId,
      title: feedbackItems.title,
      summaryText: feedbackItems.summaryText,
      review: feedbackItems.review,
      authorUserId: feedbackItems.authorUserId,
      visitorName: trackedUsers.name,
      wsName: workspaces.name,
      wsSlug: workspaces.slug,
    })
    .from(feedbackItems)
    .innerJoin(workspaces, eq(workspaces.id, feedbackItems.workspaceId))
    .leftJoin(
      trackedUsers,
      eq(trackedUsers.id, feedbackItems.authorTrackedUserId),
    )
    .where(eq(feedbackItems.id, feedbackId))
    .limit(1);
  if (!item || item.authorUserId) return [];
  const to = await recipients(db, item, "newFeedback", "instant");
  const l = links(item.wsSlug);
  const pending = item.review === "pending";
  return to.map((r) => ({
    userId: r.userId,
    template: "new-feedback",
    to: r.email,
    props: {
      workspaceName: item.wsName,
      title: item.title,
      excerpt: excerpt(item.summaryText),
      author: item.visitorName?.trim() || "A visitor",
      pending,
      url: l.idea(item.id, pending),
      settingsUrl: l.settings,
    },
  }));
}

/** Alerts for a new comment (visitor or team), never to its own author. */
export async function newCommentEmails(
  db: Db,
  commentId: string,
): Promise<(EmailJob & { userId: string })[]> {
  const [c] = await db
    .select({
      id: comments.id,
      accountId: comments.accountId,
      workspaceId: comments.workspaceId,
      body: comments.body,
      review: comments.review,
      isInternal: comments.isInternal,
      deletedAt: comments.deletedAt,
      authorUserId: comments.authorUserId,
      feedbackId: comments.feedbackId,
      cardId: comments.cardId,
      memberName: user.name,
      visitorName: trackedUsers.name,
      ideaTitle: feedbackItems.title,
      ideaReview: feedbackItems.review,
      cardTitle: roadmapCards.title,
      roadmapSlug: roadmaps.slug,
      wsName: workspaces.name,
      wsSlug: workspaces.slug,
    })
    .from(comments)
    .innerJoin(workspaces, eq(workspaces.id, comments.workspaceId))
    .leftJoin(user, eq(user.id, comments.authorUserId))
    .leftJoin(trackedUsers, eq(trackedUsers.id, comments.authorTrackedUserId))
    .leftJoin(feedbackItems, eq(feedbackItems.id, comments.feedbackId))
    .leftJoin(roadmapCards, eq(roadmapCards.id, comments.cardId))
    .leftJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!c || c.deletedAt) return [];
  const to = (await recipients(db, c, "newComment", "instant")).filter(
    (r) => r.userId !== c.authorUserId,
  );
  const l = links(c.wsSlug);
  const pending = c.review === "pending";
  const url = pending
    ? l.comments
    : c.feedbackId
      ? l.idea(c.feedbackId, c.ideaReview === "pending")
      : l.card(c.roadmapSlug ?? "", c.cardId ?? "");
  return to.map((r) => ({
    userId: r.userId,
    template: "new-comment",
    to: r.email,
    props: {
      workspaceName: c.wsName,
      targetTitle: c.ideaTitle ?? c.cardTitle ?? "",
      author: c.authorUserId
        ? (c.memberName ?? "A teammate")
        : c.visitorName?.trim() || "A visitor",
      excerpt: excerpt(c.body, 500),
      pending,
      internal: c.isInternal,
      url,
      settingsUrl: l.settings,
    },
  }));
}

/** Instant alerts for a newly confirmed update subscriber (doc 23). */
export async function newSubscriberEmails(
  db: Db,
  subscriberId: string,
): Promise<(EmailJob & { userId: string })[]> {
  const [sub] = await db
    .select({
      email: updateSubscribers.email,
      status: updateSubscribers.status,
      accountId: updateSubscribers.accountId,
      workspaceId: updateSubscribers.workspaceId,
      wsName: workspaces.name,
      wsSlug: workspaces.slug,
    })
    .from(updateSubscribers)
    .innerJoin(workspaces, eq(workspaces.id, updateSubscribers.workspaceId))
    .where(eq(updateSubscribers.id, subscriberId))
    .limit(1);
  if (!sub || sub.status !== "active") return [];
  const [[total], to] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(updateSubscribers)
      .where(
        and(
          eq(updateSubscribers.workspaceId, sub.workspaceId),
          eq(updateSubscribers.status, "active"),
        ),
      ),
    recipients(db, sub, "newSubscriber", "instant"),
  ]);
  const l = links(sub.wsSlug);
  return to.map((r) => ({
    userId: r.userId,
    template: "new-subscriber",
    to: r.email,
    props: {
      workspaceName: sub.wsName,
      email: sub.email,
      total: total?.n ?? 1,
      url: `${l.base}/updates/subscribers`,
      settingsUrl: l.settings,
    },
  }));
}

/**
 * Milestone alerts (doc 33): a card or idea reached `milestone` votes. The
 * milestone is recorded first; it's only announced when this job recorded
 * it (or recorded it within the hour, i.e. this is a retry), so voting,
 * unvoting and voting again at 25 never emails twice.
 */
export async function voteMilestoneEmails(
  db: Db,
  target: { cardId?: string; feedbackId?: string },
  milestone: number,
): Promise<(EmailJob & { userId: string })[]> {
  const [item] = target.cardId
    ? await db
        .select({
          id: roadmapCards.id,
          accountId: roadmapCards.accountId,
          workspaceId: roadmapCards.workspaceId,
          title: sql<string>`coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title})`,
          roadmapSlug: roadmaps.slug,
          wsName: workspaces.name,
          wsSlug: workspaces.slug,
        })
        .from(roadmapCards)
        .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
        .innerJoin(workspaces, eq(workspaces.id, roadmapCards.workspaceId))
        .where(eq(roadmapCards.id, target.cardId))
        .limit(1)
    : await db
        .select({
          id: feedbackItems.id,
          accountId: feedbackItems.accountId,
          workspaceId: feedbackItems.workspaceId,
          title: feedbackItems.title,
          roadmapSlug: sql<string | null>`null`,
          wsName: workspaces.name,
          wsSlug: workspaces.slug,
        })
        .from(feedbackItems)
        .innerJoin(workspaces, eq(workspaces.id, feedbackItems.workspaceId))
        .where(eq(feedbackItems.id, target.feedbackId ?? ""))
        .limit(1);
  if (!item) return [];

  const subject = target.cardId ? { cardId: item.id } : { feedbackId: item.id };
  const [recorded] = await db
    .insert(voteMilestones)
    .values({
      accountId: item.accountId,
      workspaceId: item.workspaceId,
      ...subject,
      milestone,
    })
    .onConflictDoNothing()
    .returning({ id: voteMilestones.id });
  if (!recorded) {
    const [earlier] = await db
      .select({ createdAt: voteMilestones.createdAt })
      .from(voteMilestones)
      .where(
        and(
          target.cardId
            ? eq(voteMilestones.cardId, item.id)
            : eq(voteMilestones.feedbackId, item.id),
          eq(voteMilestones.milestone, milestone),
        ),
      )
      .limit(1);
    const retry =
      earlier && Date.now() - earlier.createdAt.getTime() < 3600 * 1000;
    if (!retry) return [];
  }

  const to = await recipients(db, item, "votes", "instant");
  const l = links(item.wsSlug);
  return to.map((r) => ({
    userId: r.userId,
    template: "vote-milestone",
    to: r.email,
    props: {
      workspaceName: item.wsName,
      kind: target.cardId ? "card" : "idea",
      title: item.title,
      milestone,
      url: target.cardId
        ? l.card(item.roadmapSlug ?? "", item.id)
        : l.idea(item.id, false),
      settingsUrl: l.settings,
    },
  }));
}
