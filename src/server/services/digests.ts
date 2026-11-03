import { and, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { AlertKind } from "@/lib/schemas/notifications";
import type { Db } from "@/server/db/client";
import {
  comments,
  feedbackItems,
  roadmapCards,
  roadmaps,
  trackedUsers,
  updateSubscribers,
  updates,
  user,
  voteMilestones,
  votes,
  workspaces,
} from "@/server/db/schema";
import type { EmailJob, EmailTemplateProps } from "@/server/email/types";
import { excerpt, links, teamPrefs } from "./notifications";

// Daily and weekly digests (doc 20 step 8, doc 33). One email per member,
// workspace and period with every alert that member set to that period:
// new ideas, comments, replies to them, votes, subscribers, the ideas
// waiting for review and (weekly) the summary. Runs in the worker; every
// query is scoped by the workspace's own account and id.

export type Period = "daily" | "weekly";
type Digest = EmailTemplateProps["feedback-digest"];
type Scope = { accountId: string; workspaceId: string };

const DAY = 24 * 3600 * 1000;

/** Digests for every workspace, covering activity since `since`. */
export async function digestEmails(
  db: Db,
  since: Date,
  period: Period = "daily",
): Promise<(EmailJob & { userId: string; workspaceId: string })[]> {
  const all = await db
    .select({
      accountId: workspaces.accountId,
      workspaceId: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
    })
    .from(workspaces);
  const out: (EmailJob & { userId: string; workspaceId: string })[] = [];
  for (const ws of all) {
    out.push(...(await workspaceDigests(db, ws, since, period)));
  }
  return out;
}

async function workspaceDigests(
  db: Db,
  ws: Scope & { name: string; slug: string },
  since: Date,
  period: Period,
) {
  const team = await teamPrefs(db, ws);
  const wants = (kind: AlertKind) =>
    team.filter((m) => m.prefs[kind] === period).map((m) => m.userId);
  const want = {
    ideas: wants("newFeedback"),
    comments: wants("newComment"),
    replies: wants("replies"),
    votes: wants("votes"),
    subscribers: wants("newSubscriber"),
    review: wants("reviewReminder"),
    summary: period === "weekly" ? wants("weeklySummary") : [],
  };
  const anyone = new Set(Object.values(want).flat());
  if (!anyone.size) return [];

  const l = links(ws.slug);
  const needComments = want.comments.length || want.replies.length;
  const [ideas, recent, voteData, subscribers, review, summary, mine] =
    await Promise.all([
      want.ideas.length ? newIdeas(db, ws, since) : [],
      needComments ? newComments(db, ws, since) : [],
      want.votes.length || want.summary.length
        ? voteActivity(db, ws, since)
        : null,
      want.subscribers.length || want.summary.length
        ? newSubscribers(db, ws, since)
        : 0,
      want.review.length ? waitingForReview(db, ws) : null,
      want.summary.length ? weekCounts(db, ws, since) : null,
      want.replies.length ? commentedTargets(db, ws) : new Map(),
    ]);

  const out: (EmailJob & { userId: string; workspaceId: string })[] = [];
  for (const m of team) {
    if (!anyone.has(m.userId)) continue;
    const has = (list: string[]) => list.includes(m.userId);
    const others = recent.filter((c) => c.authorUserId !== m.userId);
    // Replies: comments on something this member commented on before.
    const firsts: Map<string, Date> = mine.get(m.userId) ?? new Map();
    const replies = has(want.replies)
      ? others.filter((c) => {
          const first = firsts.get(c.target);
          return !!first && first < c.createdAt;
        })
      : [];
    const replyIds = new Set(replies.map((c) => c.id));
    const commentList = has(want.comments)
      ? others.filter((c) => !replyIds.has(c.id))
      : [];
    const toItem = (c: (typeof recent)[number]) => ({
      target: c.targetTitle,
      author: c.author,
      excerpt: excerpt(c.body, 160),
      url: c.feedbackId
        ? l.idea(c.feedbackId, false)
        : l.card(c.roadmapSlug ?? "", c.cardId ?? ""),
    });

    const props: Digest = {
      workspaceName: ws.name,
      period,
      ideas: has(want.ideas)
        ? ideas.map((i) => ({
            title: i.title,
            author: i.author,
            url: l.idea(i.id, i.review === "pending"),
          }))
        : [],
      comments: commentList.map(toItem),
      replies: replies.map(toItem),
      subscribers: has(want.subscribers) ? subscribers : 0,
      votes:
        has(want.votes) && voteData && voteData.total
          ? {
              total: voteData.total,
              top: voteData.top.map((t) => ({
                title: t.title,
                votes: t.votes,
                url: t.cardId
                  ? l.card(t.roadmapSlug ?? "", t.cardId)
                  : l.idea(t.feedbackId ?? "", false),
              })),
              milestones: voteData.milestones.map((x) => ({
                title: x.title,
                milestone: x.milestone,
                url: x.cardId
                  ? l.card(x.roadmapSlug ?? "", x.cardId)
                  : l.idea(x.feedbackId ?? "", false),
              })),
            }
          : undefined,
      review:
        has(want.review) && review && review.total
          ? {
              total: review.total,
              items: review.items.map((i) => ({
                title: i.title,
                days: Math.max(
                  1,
                  Math.floor((Date.now() - i.createdAt.getTime()) / DAY),
                ),
                url: l.idea(i.id, true),
              })),
              url: `${l.base}/feedback/inbox`,
            }
          : undefined,
      summary:
        has(want.summary) && summary && voteData
          ? {
              ideas: summary.ideas,
              votes: voteData.total,
              comments: summary.comments,
              subscribers,
              completed: summary.completed,
              published: summary.published,
            }
          : undefined,
      url: `${l.base}/feedback`,
      settingsUrl: l.settings,
    };
    const empty =
      !props.ideas.length &&
      !props.comments.length &&
      !props.replies?.length &&
      !props.subscribers &&
      !props.votes &&
      !props.review &&
      !props.summary;
    if (empty) continue;
    out.push({
      userId: m.userId,
      workspaceId: ws.workspaceId,
      template: "feedback-digest",
      to: m.email,
      props,
    });
  }
  return out;
}

/** Visitors' ideas since `since` (team-made ones aren't news). */
function newIdeas(db: Db, ws: Scope, since: Date) {
  return db
    .select({
      id: feedbackItems.id,
      title: feedbackItems.title,
      review: feedbackItems.review,
      author: sql<string>`coalesce(nullif(trim(${trackedUsers.name}), ''), 'A visitor')`,
    })
    .from(feedbackItems)
    .leftJoin(
      trackedUsers,
      eq(trackedUsers.id, feedbackItems.authorTrackedUserId),
    )
    .where(
      and(
        eq(feedbackItems.accountId, ws.accountId),
        eq(feedbackItems.workspaceId, ws.workspaceId),
        isNull(feedbackItems.authorUserId),
        gt(feedbackItems.createdAt, since),
      ),
    );
}

async function newComments(db: Db, ws: Scope, since: Date) {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
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
    .leftJoin(trackedUsers, eq(trackedUsers.id, comments.authorTrackedUserId))
    .leftJoin(feedbackItems, eq(feedbackItems.id, comments.feedbackId))
    .leftJoin(roadmapCards, eq(roadmapCards.id, comments.cardId))
    .leftJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .where(
      and(
        eq(comments.accountId, ws.accountId),
        eq(comments.workspaceId, ws.workspaceId),
        isNull(comments.deletedAt),
        gt(comments.createdAt, since),
      ),
    )
    .orderBy(comments.createdAt);
  return rows.map((c) => ({
    ...c,
    target: (c.feedbackId ?? c.cardId) as string,
    targetTitle: c.ideaTitle ?? c.cardTitle ?? "",
    author: c.authorUserId
      ? (c.memberName ?? "A teammate")
      : c.visitorName?.trim() || "A visitor",
  }));
}

/** Per member: the ideas and cards they commented on, with the first time. */
async function commentedTargets(db: Db, ws: Scope) {
  const rows = await db
    .select({
      userId: comments.authorUserId,
      target: sql<string>`coalesce(${comments.feedbackId}, ${comments.cardId})`,
      first: sql<Date>`min(${comments.createdAt})`.mapWith(
        (v: string | Date) => new Date(v),
      ),
    })
    .from(comments)
    .where(
      and(
        eq(comments.accountId, ws.accountId),
        eq(comments.workspaceId, ws.workspaceId),
        isNotNull(comments.authorUserId),
        isNull(comments.deletedAt),
      ),
    )
    .groupBy(
      comments.authorUserId,
      sql`coalesce(${comments.feedbackId}, ${comments.cardId})`,
    );
  const byUser = new Map<string, Map<string, Date>>();
  for (const r of rows) {
    if (!r.userId) continue;
    const m = byUser.get(r.userId) ?? new Map<string, Date>();
    m.set(r.target, r.first);
    byUser.set(r.userId, m);
  }
  return byUser;
}

/** New votes since `since`: the total, the top 5 items, milestones reached. */
async function voteActivity(db: Db, ws: Scope, since: Date) {
  const scope = and(
    eq(votes.accountId, ws.accountId),
    eq(votes.workspaceId, ws.workspaceId),
    gt(votes.createdAt, since),
  );
  const [[total], top, milestones] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(votes).where(scope),
    db
      .select({
        cardId: votes.cardId,
        feedbackId: votes.feedbackId,
        votes: sql<number>`count(*)::int`,
        title: sql<string>`coalesce(max(coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title})), max(${feedbackItems.title}), '')`,
        roadmapSlug: sql<string | null>`max(${roadmaps.slug})`,
      })
      .from(votes)
      .leftJoin(roadmapCards, eq(roadmapCards.id, votes.cardId))
      .leftJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
      .leftJoin(feedbackItems, eq(feedbackItems.id, votes.feedbackId))
      .where(scope)
      .groupBy(votes.cardId, votes.feedbackId)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
    db
      .select({
        cardId: voteMilestones.cardId,
        feedbackId: voteMilestones.feedbackId,
        milestone: voteMilestones.milestone,
        title: sql<string>`coalesce(coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title}), ${feedbackItems.title}, '')`,
        roadmapSlug: roadmaps.slug,
      })
      .from(voteMilestones)
      .leftJoin(roadmapCards, eq(roadmapCards.id, voteMilestones.cardId))
      .leftJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
      .leftJoin(feedbackItems, eq(feedbackItems.id, voteMilestones.feedbackId))
      .where(
        and(
          eq(voteMilestones.accountId, ws.accountId),
          eq(voteMilestones.workspaceId, ws.workspaceId),
          gt(voteMilestones.createdAt, since),
        ),
      )
      .orderBy(desc(voteMilestones.milestone)),
  ]);
  return { total: total?.n ?? 0, top, milestones };
}

function newSubscribers(db: Db, ws: Scope, since: Date) {
  return db
    .select({ n: sql<number>`count(*)::int` })
    .from(updateSubscribers)
    .where(
      and(
        eq(updateSubscribers.accountId, ws.accountId),
        eq(updateSubscribers.workspaceId, ws.workspaceId),
        eq(updateSubscribers.status, "active"),
        gt(updateSubscribers.confirmedAt, since),
      ),
    )
    .then(([r]) => r?.n ?? 0);
}

/** Ideas still in the inbox after 24 hours, oldest first. */
async function waitingForReview(db: Db, ws: Scope) {
  const scope = and(
    eq(feedbackItems.accountId, ws.accountId),
    eq(feedbackItems.workspaceId, ws.workspaceId),
    eq(feedbackItems.review, "pending"),
    isNull(feedbackItems.archivedAt),
    isNull(feedbackItems.mergedIntoId),
    lt(feedbackItems.createdAt, new Date(Date.now() - DAY)),
  );
  const [[total], items] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(feedbackItems)
      .where(scope),
    db
      .select({
        id: feedbackItems.id,
        title: feedbackItems.title,
        createdAt: feedbackItems.createdAt,
      })
      .from(feedbackItems)
      .where(scope)
      .orderBy(feedbackItems.createdAt)
      .limit(10),
  ]);
  return { total: total?.n ?? 0, items };
}

/** The weekly summary's other counts. */
async function weekCounts(db: Db, ws: Scope, since: Date) {
  const [[ideas], [commentCount], [completed], [published]] = await Promise.all(
    [
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(feedbackItems)
        .where(
          and(
            eq(feedbackItems.accountId, ws.accountId),
            eq(feedbackItems.workspaceId, ws.workspaceId),
            gt(feedbackItems.createdAt, since),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(comments)
        .where(
          and(
            eq(comments.accountId, ws.accountId),
            eq(comments.workspaceId, ws.workspaceId),
            isNull(comments.deletedAt),
            gt(comments.createdAt, since),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(roadmapCards)
        .where(
          and(
            eq(roadmapCards.accountId, ws.accountId),
            eq(roadmapCards.workspaceId, ws.workspaceId),
            gt(roadmapCards.completedAt, since),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(updates)
        .where(
          and(
            eq(updates.accountId, ws.accountId),
            eq(updates.workspaceId, ws.workspaceId),
            eq(updates.status, "published"),
            gt(updates.publishedAt, since),
          ),
        ),
    ],
  );
  return {
    ideas: ideas?.n ?? 0,
    comments: commentCount?.n ?? 0,
    completed: completed?.n ?? 0,
    published: published?.n ?? 0,
  };
}
