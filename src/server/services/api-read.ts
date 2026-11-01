import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { wsSegment } from "@/lib/public-path";
import { renderRichText } from "@/lib/rich-text";
import type {
  ArticleListQuery,
  CardListQuery,
  FeedbackListQuery,
  UpdateListQuery,
  WorkspaceListQuery,
} from "@/server/api/schemas";
import type { Db } from "@/server/db/client";
import {
  articles,
  feedbackBoards,
  feedbackItems,
  feedbackStatuses,
  objectives,
  organization,
  roadmapCards,
  roadmapColumns,
  roadmaps,
  trackedUsers,
  updateCategories,
  updates,
  workspaces,
} from "@/server/db/schema";
import { publicSiteBase } from "./custom-domains";
import { getAccountPlan } from "./plan-limits";

// Reads for the public REST API (doc 27 step 2): account-scoped, newest
// first, cursor-paginated, in the API's own shapes (camelCase here; the
// route serializes to snake_case). Every query is filtered by accountId.

type Page = { limit: number; cursor?: string };

/** Opaque cursor: created_at + id of the last row of the previous page. */
export function encodeCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString(
    "base64url",
  );
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const date = new Date(at ?? "");
  if (!id || Number.isNaN(date.getTime())) return null;
  return { at: date, id };
}

/** `(created_at, id) < cursor`, for newest-first pages. */
function before(
  page: Page,
  createdAt: PgColumn,
  id: PgColumn,
): SQL | undefined {
  const c = decodeCursor(page.cursor);
  return c
    ? (or(lt(createdAt, c.at), and(eq(createdAt, c.at), lt(id, c.id))) as SQL)
    : undefined;
}

function pageOf<T extends { createdAt: Date; id: string }>(
  rows: T[],
  page: Page,
) {
  const more = rows.length > page.limit;
  const data = more ? rows.slice(0, page.limit) : rows;
  const last = data.at(-1);
  return { data, nextCursor: more && last ? encodeCursor(last) : null };
}

function flag(value: "true" | "false" | undefined) {
  return value === undefined ? undefined : value === "true";
}

/** Public base URL of every workspace of the account (custom domain aware). */
async function workspaceBases(db: Db, accountId: string) {
  const [account] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, accountId))
    .limit(1);
  const [base, list] = await Promise.all([
    publicSiteBase(db, accountId, account?.slug ?? ""),
    db
      .select({ id: workspaces.id, slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.accountId, accountId))
      .orderBy(asc(workspaces.createdAt), asc(workspaces.id)),
  ]);
  // The oldest workspace has the short URLs (doc 26 §11).
  const home = list[0]?.slug ?? null;
  return {
    account: base,
    of: new Map(list.map((w) => [w.id, `${base}${wsSegment(w.slug, home)}`])),
  };
}

export async function apiAccount(db: Db, accountId: string) {
  const [[row], plan, bases] = await Promise.all([
    db
      .select()
      .from(organization)
      .where(eq(organization.id, accountId))
      .limit(1),
    getAccountPlan(db, accountId),
    workspaceBases(db, accountId),
  ]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan,
    publicUrl: bases.account,
    createdAt: row.createdAt,
  };
}

export async function apiWorkspaces(
  db: Db,
  accountId: string,
  q: Page,
  id?: string,
) {
  const bases = await workspaceBases(db, accountId);
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.accountId, accountId),
        id ? eq(workspaces.id, id) : undefined,
        before(q, workspaces.createdAt, workspaces.id),
      ),
    )
    .orderBy(desc(workspaces.createdAt), desc(workspaces.id))
    .limit(q.limit + 1);
  return pageOf(
    rows.map((w) => ({ ...w, publicUrl: bases.of.get(w.id) ?? bases.account })),
    q,
  );
}

export async function apiRoadmaps(
  db: Db,
  accountId: string,
  q: WorkspaceListQuery,
  id?: string,
) {
  const rows = await db
    .select({
      id: roadmaps.id,
      workspaceId: roadmaps.workspaceId,
      slug: roadmaps.slug,
      title: roadmaps.internalTitle,
      publicTitle: roadmaps.publicTitle,
      isPublic: roadmaps.isPublic,
      createdAt: roadmaps.createdAt,
      updatedAt: roadmaps.updatedAt,
    })
    .from(roadmaps)
    .where(
      and(
        eq(roadmaps.accountId, accountId),
        id ? eq(roadmaps.id, id) : undefined,
        q.workspace_id ? eq(roadmaps.workspaceId, q.workspace_id) : undefined,
        before(q, roadmaps.createdAt, roadmaps.id),
      ),
    )
    .orderBy(desc(roadmaps.createdAt), desc(roadmaps.id))
    .limit(q.limit + 1);
  const columns = rows.length
    ? await db
        .select({
          id: roadmapColumns.id,
          roadmapId: roadmapColumns.roadmapId,
          name: roadmapColumns.name,
          isPublic: roadmapColumns.isPublic,
          isDone: roadmapColumns.isDone,
        })
        .from(roadmapColumns)
        .where(eq(roadmapColumns.accountId, accountId))
        .orderBy(asc(roadmapColumns.position))
    : [];
  return pageOf(
    rows.map((r) => ({
      ...r,
      columns: columns
        .filter((c) => c.roadmapId === r.id)
        .map(({ roadmapId: _, ...c }) => c),
    })),
    q,
  );
}

export async function apiObjectives(
  db: Db,
  accountId: string,
  q: WorkspaceListQuery,
) {
  const rows = await db
    .select({
      id: objectives.id,
      workspaceId: objectives.workspaceId,
      name: objectives.name,
      color: objectives.color,
      createdAt: objectives.createdAt,
    })
    .from(objectives)
    .where(
      and(
        eq(objectives.accountId, accountId),
        q.workspace_id ? eq(objectives.workspaceId, q.workspace_id) : undefined,
        before(q, objectives.createdAt, objectives.id),
      ),
    )
    .orderBy(desc(objectives.createdAt), desc(objectives.id))
    .limit(q.limit + 1);
  const page = pageOf(rows, q);
  return {
    ...page,
    data: page.data.map(({ createdAt: _, ...o }) => o),
  };
}

export async function apiCards(
  db: Db,
  accountId: string,
  q: CardListQuery,
  id?: string,
) {
  const completed = flag(q.completed);
  const archived = flag(q.archived);
  const bases = await workspaceBases(db, accountId);
  const rows = await db
    .select({
      id: roadmapCards.id,
      workspaceId: roadmapCards.workspaceId,
      roadmapId: roadmapCards.roadmapId,
      columnId: roadmapCards.columnId,
      slug: roadmapCards.slug,
      title: roadmapCards.title,
      publicTitle: roadmapCards.publicTitle,
      description: roadmapCards.summaryText,
      summaryJson: roadmapCards.summaryJson,
      objectiveId: roadmapCards.objectiveId,
      plannedFor: roadmapCards.plannedFor,
      isPublic: roadmapCards.isPublic,
      roadmapPublic: roadmaps.isPublic,
      votes: sql<number>`${roadmapCards.voteCount} + ${roadmapCards.importedVotes}`,
      completedAt: roadmapCards.completedAt,
      archivedAt: roadmapCards.archivedAt,
      createdAt: roadmapCards.createdAt,
      updatedAt: roadmapCards.updatedAt,
    })
    .from(roadmapCards)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .where(
      and(
        eq(roadmapCards.accountId, accountId),
        id ? eq(roadmapCards.id, id) : undefined,
        q.workspace_id
          ? eq(roadmapCards.workspaceId, q.workspace_id)
          : undefined,
        q.roadmap_id ? eq(roadmapCards.roadmapId, q.roadmap_id) : undefined,
        q.column_id ? eq(roadmapCards.columnId, q.column_id) : undefined,
        q.objective_id
          ? eq(roadmapCards.objectiveId, q.objective_id)
          : undefined,
        completed === undefined
          ? undefined
          : completed
            ? isNotNull(roadmapCards.completedAt)
            : isNull(roadmapCards.completedAt),
        archived === undefined
          ? undefined
          : archived
            ? isNotNull(roadmapCards.archivedAt)
            : isNull(roadmapCards.archivedAt),
        q.public === undefined
          ? undefined
          : eq(roadmapCards.isPublic, q.public === "true"),
        q.q
          ? (or(
              sql`${roadmapCards.search} @@ websearch_to_tsquery('english', ${q.q})`,
              ilike(roadmapCards.title, `%${q.q.replace(/[%_\\]/g, "\\$&")}%`),
            ) as SQL)
          : undefined,
        before(q, roadmapCards.createdAt, roadmapCards.id),
      ),
    )
    .orderBy(desc(roadmapCards.createdAt), desc(roadmapCards.id))
    .limit(q.limit + 1);
  return pageOf(
    rows.map(({ summaryJson, roadmapPublic, archivedAt, ...c }) => ({
      ...c,
      ...(id ? { descriptionHtml: renderRichText(summaryJson) } : {}),
      votes: Number(c.votes),
      completed: !!c.completedAt,
      archived: !!archivedAt,
      publicUrl:
        c.isPublic && roadmapPublic
          ? `${bases.of.get(c.workspaceId)}/roadmap/${c.slug}`
          : null,
    })),
    q,
  );
}

export async function apiBoards(
  db: Db,
  accountId: string,
  q: WorkspaceListQuery,
) {
  const rows = await db
    .select({
      id: feedbackBoards.id,
      workspaceId: feedbackBoards.workspaceId,
      slug: feedbackBoards.slug,
      name: feedbackBoards.name,
      isPublic: feedbackBoards.isPublic,
      createdAt: feedbackBoards.createdAt,
    })
    .from(feedbackBoards)
    .where(
      and(
        eq(feedbackBoards.accountId, accountId),
        q.workspace_id
          ? eq(feedbackBoards.workspaceId, q.workspace_id)
          : undefined,
        before(q, feedbackBoards.createdAt, feedbackBoards.id),
      ),
    )
    .orderBy(desc(feedbackBoards.createdAt), desc(feedbackBoards.id))
    .limit(q.limit + 1);
  return pageOf(rows, q);
}

export async function apiStatuses(
  db: Db,
  accountId: string,
  q: WorkspaceListQuery,
) {
  const rows = await db
    .select({
      id: feedbackStatuses.id,
      workspaceId: feedbackStatuses.workspaceId,
      name: feedbackStatuses.name,
      color: feedbackStatuses.color,
      kind: feedbackStatuses.kind,
      createdAt: feedbackStatuses.createdAt,
    })
    .from(feedbackStatuses)
    .where(
      and(
        eq(feedbackStatuses.accountId, accountId),
        q.workspace_id
          ? eq(feedbackStatuses.workspaceId, q.workspace_id)
          : undefined,
        before(q, feedbackStatuses.createdAt, feedbackStatuses.id),
      ),
    )
    .orderBy(desc(feedbackStatuses.createdAt), desc(feedbackStatuses.id))
    .limit(q.limit + 1);
  const page = pageOf(rows, q);
  return { ...page, data: page.data.map(({ createdAt: _, ...s }) => s) };
}

export async function apiFeedback(
  db: Db,
  accountId: string,
  q: FeedbackListQuery,
  id?: string,
) {
  const completed = flag(q.completed);
  const archived = flag(q.archived);
  const bases = await workspaceBases(db, accountId);
  const rows = await db
    .select({
      id: feedbackItems.id,
      workspaceId: feedbackItems.workspaceId,
      boardId: feedbackItems.boardId,
      statusId: feedbackItems.statusId,
      slug: feedbackItems.slug,
      title: feedbackItems.title,
      details: feedbackItems.summaryText,
      summaryJson: feedbackItems.summaryJson,
      objectiveId: feedbackItems.objectiveId,
      isPublic: feedbackItems.isPublic,
      boardPublic: feedbackBoards.isPublic,
      review: feedbackItems.review,
      votes: sql<number>`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`,
      comments: feedbackItems.commentCount,
      authorName: trackedUsers.name,
      authorEmail: trackedUsers.email,
      source: feedbackItems.source,
      completedAt: feedbackItems.completedAt,
      archivedAt: feedbackItems.archivedAt,
      createdAt: feedbackItems.createdAt,
      updatedAt: feedbackItems.updatedAt,
    })
    .from(feedbackItems)
    .innerJoin(feedbackBoards, eq(feedbackBoards.id, feedbackItems.boardId))
    .leftJoin(
      trackedUsers,
      eq(trackedUsers.id, feedbackItems.authorTrackedUserId),
    )
    .where(
      and(
        eq(feedbackItems.accountId, accountId),
        isNull(feedbackItems.mergedIntoId),
        id ? eq(feedbackItems.id, id) : undefined,
        q.workspace_id
          ? eq(feedbackItems.workspaceId, q.workspace_id)
          : undefined,
        q.board_id ? eq(feedbackItems.boardId, q.board_id) : undefined,
        q.status_id ? eq(feedbackItems.statusId, q.status_id) : undefined,
        q.review ? eq(feedbackItems.review, q.review) : undefined,
        completed === undefined
          ? undefined
          : completed
            ? isNotNull(feedbackItems.completedAt)
            : isNull(feedbackItems.completedAt),
        archived === undefined
          ? undefined
          : archived
            ? isNotNull(feedbackItems.archivedAt)
            : isNull(feedbackItems.archivedAt),
        q.q
          ? (or(
              sql`${feedbackItems.search} @@ websearch_to_tsquery('english', ${q.q})`,
              ilike(feedbackItems.title, `%${q.q.replace(/[%_\\]/g, "\\$&")}%`),
            ) as SQL)
          : undefined,
        before(q, feedbackItems.createdAt, feedbackItems.id),
      ),
    )
    .orderBy(desc(feedbackItems.createdAt), desc(feedbackItems.id))
    .limit(q.limit + 1);
  return pageOf(
    rows.map(({ summaryJson, boardPublic, authorName, authorEmail, ...f }) => ({
      ...f,
      ...(id ? { detailsHtml: renderRichText(summaryJson) } : {}),
      votes: Number(f.votes),
      author:
        authorName || authorEmail
          ? { name: authorName, email: authorEmail }
          : null,
      publicUrl:
        f.isPublic && boardPublic && f.review === "approved"
          ? `${bases.of.get(f.workspaceId)}/ideas/${f.slug}`
          : null,
    })),
    q,
  );
}

export async function apiUpdates(
  db: Db,
  accountId: string,
  q: UpdateListQuery,
  id?: string,
) {
  const bases = await workspaceBases(db, accountId);
  const rows = await db
    .select({
      id: updates.id,
      workspaceId: updates.workspaceId,
      slug: updates.slug,
      title: updates.title,
      status: updates.status,
      isPublic: updates.isPublic,
      pinned: updates.pinned,
      categoryName: updateCategories.name,
      categoryColor: updateCategories.color,
      bodyText: updates.bodyText,
      bodyJson: updates.bodyJson,
      publishAt: updates.publishAt,
      publishedAt: updates.publishedAt,
      createdAt: updates.createdAt,
      updatedAt: updates.updatedAt,
    })
    .from(updates)
    .leftJoin(updateCategories, eq(updateCategories.id, updates.categoryId))
    .where(
      and(
        eq(updates.accountId, accountId),
        id ? eq(updates.id, id) : undefined,
        q.workspace_id ? eq(updates.workspaceId, q.workspace_id) : undefined,
        q.status ? eq(updates.status, q.status) : undefined,
        before(q, updates.createdAt, updates.id),
      ),
    )
    .orderBy(desc(updates.createdAt), desc(updates.id))
    .limit(q.limit + 1);
  return pageOf(
    rows.map(({ categoryName, categoryColor, bodyText, bodyJson, ...u }) => ({
      ...u,
      category:
        categoryName && categoryColor
          ? { name: categoryName, color: categoryColor }
          : null,
      excerpt: bodyText.slice(0, 300),
      ...(id ? { contentHtml: renderRichText(bodyJson) } : {}),
      publicUrl:
        u.status === "published" && u.isPublic
          ? `${bases.of.get(u.workspaceId)}/updates/${u.slug}`
          : null,
    })),
    q,
  );
}

export async function apiArticles(
  db: Db,
  accountId: string,
  q: ArticleListQuery,
  id?: string,
) {
  const bases = await workspaceBases(db, accountId);
  const rows = await db
    .select({
      id: articles.id,
      workspaceId: articles.workspaceId,
      categoryId: articles.categoryId,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      bodyJson: articles.bodyJson,
      status: articles.status,
      isPublic: articles.isPublic,
      featured: articles.featured,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(
      and(
        eq(articles.accountId, accountId),
        id ? eq(articles.id, id) : undefined,
        q.workspace_id ? eq(articles.workspaceId, q.workspace_id) : undefined,
        q.status ? eq(articles.status, q.status) : undefined,
        before(q, articles.createdAt, articles.id),
      ),
    )
    .orderBy(desc(articles.createdAt), desc(articles.id))
    .limit(q.limit + 1);
  return pageOf(
    rows.map(({ bodyJson, ...a }) => ({
      ...a,
      ...(id ? { contentHtml: renderRichText(bodyJson) } : {}),
      publicUrl:
        a.status === "published" && a.isPublic
          ? `${bases.of.get(a.workspaceId)}/articles/${a.slug}`
          : null,
    })),
    q,
  );
}
