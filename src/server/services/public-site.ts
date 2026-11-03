import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { planIncludes } from "@/lib/plans";
import { renderRichText } from "@/lib/rich-text";
import {
  defaultDisplay,
  type RoadmapDisplaySettings,
} from "@/lib/schemas/roadmap";
import { stationOf } from "@/lib/stations";
import type { Db } from "@/server/db/client";
import {
  accountSettings,
  articles,
  cardAttachments,
  cardFeatures,
  cardFeedbackLinks,
  cardTags,
  comments,
  feedbackBoards,
  feedbackItems,
  objectives,
  organization,
  roadmapCards,
  roadmapColumns,
  roadmaps,
  tags,
  workspaces,
} from "@/server/db/schema";
import { fileUrl } from "@/server/storage/url";
import { likePattern } from "./cards";
import type { PublicContext } from "./context";
import { defaultWorkspaceSlug } from "./default-workspace";
import { gateSettings, getAccountPlan } from "./plan-limits";
import { byPosition } from "./positions";
import {
  articleIsPublic,
  articlePathStatus,
  hasPublicArticles,
} from "./public-articles";
import { boardIsPublic, hasPublicIdeas, ideaPathStatus } from "./public-ideas";
import { hasPublicUpdates, updatePathStatus } from "./public-updates";

// Public site queries (doc 19 §4.1). The account comes from the URL path
// (/<account>/…), never from an account id sent by the client. Only public roadmaps, public columns and public,
// unarchived cards are returned, with only the fields `display` allows.

/**
 * A roadmap the public may see: marked public, and its workspace hasn't
 * switched the Roadmap module off (Public settings, doc 22 P2). Written with
 * a table-qualified column: in one-table selects Drizzle renders columns
 * unqualified, which inside a subquery would bind to the wrong table.
 */
const roadmapIsPublic = and(
  eq(roadmaps.isPublic, true),
  sql`not exists (select 1 from ${workspaces} hidden where hidden.id = "roadmaps"."workspace_id" and hidden.settings->>'showRoadmap' = 'false')`,
) as SQL;

export type PublicSite = {
  accountId: string;
  name: string;
  slug: string;
  logo: string | null;
  /** Oldest workspace: its pages live at /<account>/<module> (doc 26 §11). */
  defaultWorkspace: string | null;
};

/**
 * The account whose public site lives at /<slug> (doc 19, D1 revised).
 * Custom domains (Phase 6) will add a host lookup next to this one.
 */
export async function resolveSite(
  db: Db,
  slug: string,
): Promise<PublicSite | null> {
  const s = slug.toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) return null;
  const [row] = await db
    .select({
      accountId: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      defaultWorkspace: defaultWorkspaceSlug('"organization"."id"'),
    })
    .from(organization)
    .where(and(eq(organization.slug, s), notSuspended))
    .limit(1);
  return row ?? null;
}

/**
 * A suspended account's site is hidden from everything that resolves sites
 * (pages, public API, widget, embeds; doc 28 C8). Raw SQL on the outer
 * organization row, like roadmapIsPublic.
 */
const notSuspended = sql`not exists (select 1 from ${accountSettings} s where s.account_id = "organization"."id" and s.suspended_at is not null)`;

/** True when `slug` is an account that a platform admin suspended. */
export async function isSuspendedSlug(db: Db, slug: string) {
  const [row] = await db
    .select({ at: accountSettings.suspendedAt })
    .from(organization)
    .innerJoin(accountSettings, eq(accountSettings.accountId, organization.id))
    .where(eq(organization.slug, slug.toLowerCase()))
    .limit(1);
  return !!row?.at;
}

/** Workspaces with at least one public roadmap or public ideas board. */
export async function listPublicWorkspaces(db: Db, ctx: PublicContext) {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      logo: workspaces.logo,
      settings: workspaces.settings,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.accountId, ctx.accountId),
        or(
          exists(
            db
              .select({ one: sql`1` })
              .from(roadmaps)
              .where(
                and(eq(roadmaps.workspaceId, workspaces.id), roadmapIsPublic),
              ),
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(feedbackBoards)
              .where(
                and(
                  eq(feedbackBoards.workspaceId, workspaces.id),
                  boardIsPublic,
                ),
              ),
          ),
          // Updates shows whenever it's switched on, posts or not (owner).
          sql`coalesce(${workspaces.settings}->>'showUpdates', 'true') <> 'false'`,
          exists(
            db
              .select({ one: sql`1` })
              .from(articles)
              .where(
                and(eq(articles.workspaceId, workspaces.id), articleIsPublic),
              ),
          ),
        ),
      ),
    )
    .orderBy(workspaces.createdAt);
}

export async function getPublicWorkspace(
  db: Db,
  ctx: PublicContext,
  slug: string,
) {
  return publicWorkspace(db, ctx, eq(workspaces.slug, slug));
}

/** Same as getPublicWorkspace, by id (public API routes). */
export async function getPublicWorkspaceById(
  db: Db,
  ctx: PublicContext,
  id: string,
) {
  return publicWorkspace(db, ctx, eq(workspaces.id, id));
}

async function publicWorkspace(db: Db, ctx: PublicContext, match: SQL) {
  const [ws] = await db
    .select({
      ...getTableColumns(workspaces),
      defaultSlug: defaultWorkspaceSlug('"workspaces"."account_id"'),
    })
    .from(workspaces)
    .where(and(eq(workspaces.accountId, ctx.accountId), match))
    .limit(1);
  if (!ws) return null;
  const boards = await db
    .select({
      id: roadmaps.id,
      slug: roadmaps.slug,
      title: sql<string>`coalesce(${roadmaps.publicTitle}, ${roadmaps.internalTitle})`,
    })
    .from(roadmaps)
    .where(
      and(
        eq(roadmaps.accountId, ctx.accountId),
        eq(roadmaps.workspaceId, ws.id),
        roadmapIsPublic,
      ),
    )
    .orderBy(byPosition(roadmaps.position));
  const [ideas, posts, kb] = await Promise.all([
    hasPublicIdeas(db, ctx, ws.id),
    hasPublicUpdates(db, ctx, ws.id),
    hasPublicArticles(db, ctx, ws.id),
  ]);
  // Updates shows whenever it's switched on, even before the first post
  // (owner, 2026-11-03): an empty journal still takes subscribers.
  const updatesOn = posts || ws.settings.showUpdates !== false;
  if (!boards.length && !ideas && !updatesOn && !kb) return null;
  const plan = await getAccountPlan(db, ctx.accountId);
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    /** Lives at /<account>/<module>, without its slug (doc 26 §11). */
    isDefault: ws.slug === ws.defaultSlug,
    logo: ws.logo,
    settings: await gateSettings(db, ctx.accountId, ws.settings),
    /** Plan features the public site checks (doc 26 P7). */
    features: {
      reactions: planIncludes(plan, "reactions"),
      embed: planIncludes(plan, "embed"),
      logo: planIncludes(plan, "logo"),
    },
    roadmaps: boards,
    /** At least one public post (the Updates tab shows without any). */
    hasPosts: posts,
    modules: {
      roadmap: boards.length > 0,
      updates: updatesOn,
      ideas,
      articles: kb,
    },
  };
}

export type PublicCard = {
  id: string;
  slug: string;
  columnId: string;
  title: string;
  completed: boolean;
  /** null when the roadmap hides vote counts. */
  votes: number | null;
  /** Plain-text preview (null when descriptions are hidden). */
  preview: string | null;
  /** Sanitized HTML (card page/drawer only). */
  html: string | null;
  objective: { name: string; color: string } | null;
  tags: string[];
  plannedFor: string | null;
  features: { title: string; done: boolean }[] | null;
  /** Completed features (null when progress bars are hidden or none). */
  progress: { done: number; total: number } | null;
  /** Header image URL (doc 24 R5). */
  image: string | null;
  /** Card page only, when the roadmap shows attachments publicly. */
  attachments: { name: string; url: string; contentType: string }[] | null;
  /** Public, approved feedback linked to the card (the 💡 count). */
  ideas: number;
  /** Approved public comments (team notes never count). */
  comments: number;
  /** The visible ideas linked to the card, most votes first (drawer/page). */
  requestedIn: { title: string; slug: string; votes: number }[] | null;
};

type CardFilter = { roadmapId: string; q?: string; slug?: string };

async function publicCards(
  db: Db,
  ctx: PublicContext,
  display: RoadmapDisplaySettings,
  filter: CardFilter,
  withHtml: boolean,
): Promise<PublicCard[]> {
  const where = [
    eq(roadmapCards.accountId, ctx.accountId),
    eq(roadmapCards.roadmapId, filter.roadmapId),
    eq(roadmapCards.isPublic, true),
    isNull(roadmapCards.archivedAt),
    eq(roadmapColumns.isPublic, true),
  ];
  if (!display.showCompleted) where.push(isNull(roadmapCards.completedAt));
  if (filter.slug) where.push(eq(roadmapCards.slug, filter.slug));
  if (filter.q) {
    where.push(
      or(
        sql`${roadmapCards.search} @@ websearch_to_tsquery('english', ${filter.q})`,
        ilike(
          sql`coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title})`,
          likePattern(filter.q),
        ),
      ) as ReturnType<typeof eq>,
    );
  }

  const rows = await db
    .select({
      id: roadmapCards.id,
      slug: roadmapCards.slug,
      columnId: roadmapCards.columnId,
      title: sql<string>`coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title})`,
      completedAt: roadmapCards.completedAt,
      voteCount: roadmapCards.voteCount,
      importedVotes: roadmapCards.importedVotes,
      summaryText: roadmapCards.summaryText,
      summaryJson: roadmapCards.summaryJson,
      plannedFor: roadmapCards.plannedFor,
      headerImageKey: roadmapCards.headerImageKey,
      objectiveName: objectives.name,
      objectiveColor: objectives.color,
      ideas: sql<number>`(select count(*)::int from ${cardFeedbackLinks} inner join ${feedbackItems} on ${feedbackItems.id} = ${cardFeedbackLinks.feedbackId} where ${cardFeedbackLinks.cardId} = ${roadmapCards.id} and ${feedbackItems.isPublic} and ${feedbackItems.review} = 'approved' and ${feedbackItems.archivedAt} is null)`,
      comments: sql<number>`(select count(*)::int from ${comments} where ${comments.cardId} = ${roadmapCards.id} and not ${comments.isInternal} and ${comments.review} = 'approved' and ${comments.deletedAt} is null)`,
    })
    .from(roadmapCards)
    .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
    .leftJoin(objectives, eq(objectives.id, roadmapCards.objectiveId))
    .where(and(...where))
    .orderBy(byPosition(roadmapCards.position));

  const ids = rows.map((r) => r.id);
  const withAttachments = withHtml && display.showAttachments;
  const [tagRows, featureRows, attachmentRows, ideaRows] = ids.length
    ? await Promise.all([
        display.showTags
          ? db
              .select({ cardId: cardTags.cardId, name: tags.name })
              .from(cardTags)
              .innerJoin(tags, eq(tags.id, cardTags.tagId))
              .where(inArray(cardTags.cardId, ids))
          : [],
        display.showFeatures || display.showFeatureProgress
          ? db
              .select({
                cardId: cardFeatures.cardId,
                title: cardFeatures.title,
                done: cardFeatures.done,
              })
              .from(cardFeatures)
              .where(inArray(cardFeatures.cardId, ids))
              .orderBy(byPosition(cardFeatures.position))
          : [],
        withAttachments
          ? db
              .select({
                cardId: cardAttachments.cardId,
                key: cardAttachments.key,
                name: cardAttachments.name,
                contentType: cardAttachments.contentType,
              })
              .from(cardAttachments)
              .where(inArray(cardAttachments.cardId, ids))
              .orderBy(asc(cardAttachments.createdAt))
          : [],
        withHtml
          ? db
              .select({
                cardId: cardFeedbackLinks.cardId,
                title: feedbackItems.title,
                slug: feedbackItems.slug,
                votes: sql<number>`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`,
              })
              .from(cardFeedbackLinks)
              .innerJoin(
                feedbackItems,
                eq(feedbackItems.id, cardFeedbackLinks.feedbackId),
              )
              .innerJoin(
                feedbackBoards,
                eq(feedbackBoards.id, feedbackItems.boardId),
              )
              .where(
                and(
                  eq(cardFeedbackLinks.accountId, ctx.accountId),
                  inArray(cardFeedbackLinks.cardId, ids),
                  boardIsPublic,
                  eq(feedbackItems.isPublic, true),
                  eq(feedbackItems.review, "approved"),
                  isNull(feedbackItems.archivedAt),
                  isNull(feedbackItems.mergedIntoId),
                ),
              )
              .orderBy(
                desc(
                  sql`${feedbackItems.voteCount} + ${feedbackItems.importedVotes}`,
                ),
              )
          : [],
      ])
    : [[], [], [], []];

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    columnId: r.columnId,
    title: r.title,
    completed: !!r.completedAt,
    votes: display.showVotes ? r.voteCount + r.importedVotes : null,
    preview: display.showDescriptions
      ? r.summaryText.slice(0, 160) || null
      : null,
    html:
      withHtml && display.showDescriptions
        ? renderRichText(r.summaryJson) || null
        : null,
    objective:
      display.showObjectives && r.objectiveName && r.objectiveColor
        ? { name: r.objectiveName, color: r.objectiveColor }
        : null,
    tags: tagRows.filter((t) => t.cardId === r.id).map((t) => t.name),
    plannedFor: display.showDates ? r.plannedFor : null,
    features: display.showFeatures
      ? featureRows
          .filter((f) => f.cardId === r.id)
          .map(({ title, done }) => ({ title, done }))
      : null,
    progress: featureProgress(
      display.showFeatureProgress
        ? featureRows.filter((f) => f.cardId === r.id)
        : [],
    ),
    image: display.showImageHeaders ? fileUrl(r.headerImageKey) : null,
    attachments: withAttachments
      ? attachmentRows
          .filter((a) => a.cardId === r.id)
          .flatMap((a) => {
            const url = fileUrl(a.key);
            return url
              ? [{ name: a.name, url, contentType: a.contentType }]
              : [];
          })
      : null,
    ideas: r.ideas,
    comments: r.comments,
    requestedIn: withHtml
      ? ideaRows
          .filter((i) => i.cardId === r.id)
          .slice(0, 5)
          .map(({ title, slug, votes }) => ({
            title,
            slug,
            votes: Number(votes),
          }))
      : null,
  }));
}

function featureProgress(features: { done: boolean }[]) {
  if (!features.length) return null;
  return {
    done: features.filter((f) => f.done).length,
    total: features.length,
  };
}

async function getPublicRoadmapRow(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  slug?: string,
) {
  const [row] = await db
    .select()
    .from(roadmaps)
    .where(
      and(
        eq(roadmaps.accountId, ctx.accountId),
        eq(roadmaps.workspaceId, workspaceId),
        roadmapIsPublic,
        slug ? eq(roadmaps.slug, slug) : undefined,
      ),
    )
    .orderBy(byPosition(roadmaps.position))
    .limit(1);
  return row ?? null;
}

/** A public roadmap with its public columns and cards (optionally searched). */
export async function getPublicRoadmap(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  options: { slug?: string; q?: string } = {},
) {
  const roadmap = await getPublicRoadmapRow(db, ctx, workspaceId, options.slug);
  if (!roadmap) return null;
  const display = { ...defaultDisplay, ...roadmap.display };
  const visible = and(
    eq(roadmapCards.accountId, ctx.accountId),
    eq(roadmapCards.roadmapId, roadmap.id),
    eq(roadmapCards.isPublic, true),
    isNull(roadmapCards.archivedAt),
    eq(roadmapColumns.isPublic, true),
  );
  const [columns, cards, [live]] = await Promise.all([
    db
      .select({
        id: roadmapColumns.id,
        name: roadmapColumns.name,
        isDone: roadmapColumns.isDone,
        stage: roadmapColumns.stage,
      })
      .from(roadmapColumns)
      .where(
        and(
          eq(roadmapColumns.accountId, ctx.accountId),
          eq(roadmapColumns.roadmapId, roadmap.id),
          eq(roadmapColumns.isPublic, true),
        ),
      )
      .orderBy(byPosition(roadmapColumns.position)),
    publicCards(
      db,
      ctx,
      display,
      { roadmapId: roadmap.id, q: options.q },
      true,
    ),
    // The hero's live line (doc 32 decision 17), ignoring the search.
    db
      .select({
        shippedThisYear: sql<number>`count(*) filter (where ${roadmapCards.completedAt} >= date_trunc('year', now()))::int`,
        updatedAt: sql<string | null>`max(${roadmapCards.updatedAt})`,
      })
      .from(roadmapCards)
      .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
      .where(visible),
  ]);
  return {
    id: roadmap.id,
    slug: roadmap.slug,
    title: roadmap.publicTitle ?? roadmap.internalTitle,
    /** Plain text, for meta descriptions. */
    summary: roadmap.publicSummary,
    /** Shown above the board (null when the roadmap hides it). */
    summaryHtml: display.showSummary
      ? renderRichText(roadmap.publicSummaryJson) || null
      : null,
    display,
    columns,
    cards,
    stats: {
      shippedThisYear: live?.shippedThisYear ?? 0,
      /** Latest change to a visible card (ISO), or null. */
      updatedAt: live?.updatedAt
        ? new Date(live.updatedAt).toISOString()
        : null,
    },
  };
}

/** One public card by slug, from any public roadmap of the workspace. */
export async function getPublicCard(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
  slug: string,
) {
  const [own] = await db
    .select({ roadmap: roadmaps })
    .from(roadmapCards)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .where(
      and(
        eq(roadmapCards.accountId, ctx.accountId),
        eq(roadmapCards.workspaceId, workspaceId),
        eq(roadmapCards.slug, slug),
        roadmapIsPublic,
      ),
    )
    .limit(1)
    .then((rows) => rows.map((r) => r.roadmap));
  if (!own) return null;
  const display = { ...defaultDisplay, ...own.display };
  const [card] = await publicCards(
    db,
    ctx,
    display,
    { roadmapId: own.id, slug },
    true,
  );
  if (!card) return null;
  const [column] = await db
    .select({
      name: roadmapColumns.name,
      stage: roadmapColumns.stage,
      isDone: roadmapColumns.isDone,
    })
    .from(roadmapColumns)
    .where(eq(roadmapColumns.id, card.columnId))
    .limit(1);
  return {
    card,
    columnName: column?.name ?? "",
    station: column ? stationOf(column) : ("next" as const),
    roadmap: { slug: own.slug, title: own.publicTitle ?? own.internalTitle },
    display,
  };
}

/**
 * The card a public vote is for, if it is visible on the public site of this
 * account. Returns what the vote endpoint needs to apply workspace rules.
 */
export async function getVotableCard(
  db: Db,
  ctx: PublicContext,
  cardId: string,
) {
  const [row] = await db
    .select({
      id: roadmapCards.id,
      workspaceId: roadmapCards.workspaceId,
      settings: workspaces.settings,
      completedAt: roadmapCards.completedAt,
      display: roadmaps.display,
    })
    .from(roadmapCards)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
    .innerJoin(workspaces, eq(workspaces.id, roadmapCards.workspaceId))
    .where(
      and(
        eq(roadmapCards.accountId, ctx.accountId),
        eq(roadmapCards.id, cardId),
        eq(roadmapCards.isPublic, true),
        isNull(roadmapCards.archivedAt),
        roadmapIsPublic,
        eq(roadmapColumns.isPublic, true),
      ),
    )
    .limit(1);
  if (!row) return null;
  const display = { ...defaultDisplay, ...row.display };
  if (row.completedAt && !display.showCompleted) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    requireVoterLogin: !!row.settings.requireVoterLogin,
  };
}

/** Public cards for sitemap.xml: every visible card of every public roadmap. */
export async function listSitemapEntries(db: Db, ctx: PublicContext) {
  return db
    .select({
      workspace: workspaces.slug,
      card: roadmapCards.slug,
      updatedAt: roadmapCards.updatedAt,
      indexable: sql<boolean>`coalesce((${workspaces.settings}->>'indexPublicPages')::boolean, true)`,
    })
    .from(roadmapCards)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
    .innerJoin(workspaces, eq(workspaces.id, roadmapCards.workspaceId))
    .where(
      and(
        eq(roadmapCards.accountId, ctx.accountId),
        eq(roadmapCards.isPublic, true),
        isNull(roadmapCards.archivedAt),
        roadmapIsPublic,
        eq(roadmapColumns.isPublic, true),
      ),
    );
}

/** True when `workspaceId` belongs to this site's account. */
export async function isSiteWorkspace(
  db: Db,
  ctx: PublicContext,
  workspaceId: string,
) {
  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.accountId, ctx.accountId),
        eq(workspaces.id, workspaceId),
      ),
    )
    .limit(1);
  return !!row;
}

/** The first module a workspace shows: its tab when you open /<ws>. */
function homeModule(ws: {
  modules: { roadmap: boolean; updates: boolean; ideas: boolean };
  hasPosts: boolean;
}) {
  // An Updates page without posts is a last resort, not a landing page.
  if (ws.modules.roadmap) return "roadmap";
  if (ws.modules.updates && ws.hasPosts) return "updates";
  if (ws.modules.ideas) return "ideas";
  return ws.modules.updates ? "updates" : "articles";
}

export type PublicPathStatus = "ok" | "missing" | { redirect: string };

/**
 * Cheap existence check for a public-site path, run by the proxy before the
 * page streams, so missing pages get a real 404 and the `/<account>` and
 * `/<account>/<workspace>` shortcuts get real redirects. `segments` and the
 * redirect are relative to the site root (/<account>). Same visibility rules
 * as the page loaders above.
 */
export async function publicPathStatus(
  db: Db,
  ctx: PublicContext,
  segments: string[],
  board?: string,
): Promise<PublicPathStatus> {
  const [ws, module, cardSlug, ...rest] = segments;
  if (!ws) {
    const list = await listPublicWorkspaces(db, ctx);
    const [only] = list;
    if (list.length !== 1 || !only) return "ok";
    const home = await getPublicWorkspace(db, ctx, only.slug);
    return home ? { redirect: `/${only.slug}/${homeModule(home)}` } : "ok";
  }
  if (segments.length === 1 && ws === "sitemap.xml") return "ok";
  if (module === "ideas") {
    return rest.length ? "missing" : ideaPathStatus(db, ctx, ws, cardSlug);
  }
  if (module === "updates") {
    return rest.length ? "missing" : updatePathStatus(db, ctx, ws, cardSlug);
  }
  if (module === "articles") {
    return articlePathStatus(
      db,
      ctx,
      ws,
      cardSlug === undefined ? [] : [cardSlug, ...rest],
    );
  }
  if (rest.length || (module !== undefined && module !== "roadmap")) {
    return "missing";
  }
  if (!module) {
    const home = await getPublicWorkspace(db, ctx, ws);
    return home ? { redirect: `/${ws}/${homeModule(home)}` } : "missing";
  }

  const roadmapScope = and(
    eq(roadmaps.accountId, ctx.accountId),
    eq(workspaces.slug, ws),
    roadmapIsPublic,
  );

  if (!cardSlug) {
    const [row] = await db
      .select({ id: roadmaps.id })
      .from(roadmaps)
      .innerJoin(workspaces, eq(workspaces.id, roadmaps.workspaceId))
      .where(
        and(
          roadmapScope,
          module && board ? eq(roadmaps.slug, board) : undefined,
        ),
      )
      .limit(1);
    if (!row) return "missing";
    return module ? "ok" : { redirect: `/${ws}/roadmap` };
  }

  const [card] = await db
    .select({
      completedAt: roadmapCards.completedAt,
      display: roadmaps.display,
    })
    .from(roadmapCards)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapCards.roadmapId))
    .innerJoin(roadmapColumns, eq(roadmapColumns.id, roadmapCards.columnId))
    .innerJoin(workspaces, eq(workspaces.id, roadmapCards.workspaceId))
    .where(
      and(
        roadmapScope,
        eq(roadmapCards.slug, cardSlug),
        eq(roadmapCards.isPublic, true),
        isNull(roadmapCards.archivedAt),
        eq(roadmapColumns.isPublic, true),
      ),
    )
    .limit(1);
  if (!card) return "missing";
  const display = { ...defaultDisplay, ...card.display };
  return card.completedAt && !display.showCompleted ? "missing" : "ok";
}

/** Slug of the account's default (oldest) workspace (doc 26 §11). */
export async function getDefaultWorkspace(db: Db, accountId: string) {
  const [row] = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.accountId, accountId))
    .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
    .limit(1);
  return row?.slug ?? null;
}
