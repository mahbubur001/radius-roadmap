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
  const f: Frequency = role === "member" ? "off" : "instant";
  return { newFeedback: f, newComment: f, newSubscriber: "off" };
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
  return row
    ? {
        newFeedback: row.newFeedback,
        newComment: row.newComment,
        newSubscriber: row.newSubscriber,
      }
    : defaultPrefs(ctx.role);
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

type Kind = keyof NotificationPrefs;

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
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: member.role,
      newFeedback: notificationPreferences.newFeedback,
      newComment: notificationPreferences.newComment,
      newSubscriber: notificationPreferences.newSubscriber,
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
  return rows.filter((r) => {
    const set = r[kind] ?? defaultPrefs(toRole(r.role))[kind];
    return set === freq;
  });
}

function origin() {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

function excerpt(text: string, max = 240) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function links(workspaceSlug: string) {
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

/**
 * Daily digests: for every member + workspace with "daily" for either kind,
 * the visitors' ideas and the comments (not their own) since `since`.
 */
export async function digestEmails(
  db: Db,
  since: Date,
): Promise<(EmailJob & { userId: string; workspaceId: string })[]> {
  const pairs = await db
    .select({
      accountId: notificationPreferences.accountId,
      workspaceId: notificationPreferences.workspaceId,
    })
    .from(notificationPreferences)
    .where(
      or(
        eq(notificationPreferences.newFeedback, "daily"),
        eq(notificationPreferences.newComment, "daily"),
        eq(notificationPreferences.newSubscriber, "daily"),
      ),
    )
    .groupBy(
      notificationPreferences.accountId,
      notificationPreferences.workspaceId,
    );

  const out: (EmailJob & { userId: string; workspaceId: string })[] = [];
  for (const scope of pairs) {
    const [ws] = await db
      .select({ name: workspaces.name, slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, scope.workspaceId))
      .limit(1);
    if (!ws) continue;
    const l = links(ws.slug);
    const [ideas, recent] = await Promise.all([
      db
        .select({
          id: feedbackItems.id,
          title: feedbackItems.title,
          review: feedbackItems.review,
          visitorName: trackedUsers.name,
        })
        .from(feedbackItems)
        .leftJoin(
          trackedUsers,
          eq(trackedUsers.id, feedbackItems.authorTrackedUserId),
        )
        .where(
          and(
            eq(feedbackItems.accountId, scope.accountId),
            eq(feedbackItems.workspaceId, scope.workspaceId),
            isNull(feedbackItems.authorUserId),
            gt(feedbackItems.createdAt, since),
          ),
        ),
      db
        .select({
          body: comments.body,
          authorUserId: comments.authorUserId,
          memberName: user.name,
          visitorName: trackedUsers.name,
          feedbackId: comments.feedbackId,
          cardId: comments.cardId,
          ideaTitle: feedbackItems.title,
          cardTitle: roadmapCards.title,
          roadmapSlug: roadmaps.slug,
        })
        .from(comments)
        .leftJoin(user, eq(user.id, comments.authorUserId))
        .leftJoin(
          trackedUsers,
          eq(trackedUsers.id, comments.authorTrackedUserId),
        )
        .leftJoin(feedbackItems, eq(feedbackItems.id, comments.feedbackId))
        .leftJoin(roadmapCards, eq(roadmapCards.id, comments.cardId))
        .leftJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
        .where(
          and(
            eq(comments.accountId, scope.accountId),
            eq(comments.workspaceId, scope.workspaceId),
            isNull(comments.deletedAt),
            gt(comments.createdAt, since),
          ),
        ),
    ]);

    const [forIdeas, forComments, forSubscribers, [subs]] = await Promise.all([
      recipients(db, scope, "newFeedback", "daily"),
      recipients(db, scope, "newComment", "daily"),
      recipients(db, scope, "newSubscriber", "daily"),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(updateSubscribers)
        .where(
          and(
            eq(updateSubscribers.accountId, scope.accountId),
            eq(updateSubscribers.workspaceId, scope.workspaceId),
            eq(updateSubscribers.status, "active"),
            gt(updateSubscribers.confirmedAt, since),
          ),
        ),
    ]);
    const people = new Map(
      [...forIdeas, ...forComments, ...forSubscribers].map((r) => [
        r.userId,
        r,
      ]),
    );
    for (const r of people.values()) {
      const wantsIdeas = forIdeas.some((x) => x.userId === r.userId);
      const wantsComments = forComments.some((x) => x.userId === r.userId);
      const myIdeas = wantsIdeas
        ? ideas.map((i) => ({
            title: i.title,
            author: i.visitorName?.trim() || "A visitor",
            url: l.idea(i.id, i.review === "pending"),
          }))
        : [];
      const myComments = wantsComments
        ? recent
            .filter((c) => c.authorUserId !== r.userId)
            .map((c) => ({
              target: c.ideaTitle ?? c.cardTitle ?? "",
              author: c.authorUserId
                ? (c.memberName ?? "A teammate")
                : c.visitorName?.trim() || "A visitor",
              excerpt: excerpt(c.body, 160),
              url: c.feedbackId
                ? l.idea(c.feedbackId, false)
                : l.card(c.roadmapSlug ?? "", c.cardId ?? ""),
            }))
        : [];
      const mySubscribers = forSubscribers.some((x) => x.userId === r.userId)
        ? (subs?.n ?? 0)
        : 0;
      if (!myIdeas.length && !myComments.length && !mySubscribers) continue;
      out.push({
        userId: r.userId,
        workspaceId: scope.workspaceId,
        template: "feedback-digest",
        to: r.email,
        props: {
          workspaceName: ws.name,
          ideas: myIdeas,
          comments: myComments,
          subscribers: mySubscribers,
          url: `${l.base}/feedback`,
          settingsUrl: l.settings,
        },
      });
    }
  }
  return out;
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
