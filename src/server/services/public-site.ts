import {
  and,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { renderRichText } from "@/lib/rich-text";
import {
  defaultDisplay,
  type RoadmapDisplaySettings,
} from "@/lib/schemas/roadmap";
import type { Db } from "@/server/db/client";
import {
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
import { likePattern } from "./cards";
import type { PublicContext } from "./context";
import { byPosition } from "./positions";
import { boardIsPublic, hasPublicIdeas, ideaPathStatus } from "./public-ideas";

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
    })
    .from(organization)
    .where(eq(organization.slug, s))
    .limit(1);
  return row ?? null;
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
    .select()
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
  const ideas = await hasPublicIdeas(db, ctx, ws.id);
  if (!boards.length && !ideas) return null;
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    logo: ws.logo,
    settings: ws.settings,
    roadmaps: boards,
    modules: { roadmap: boards.length > 0, ideas },
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
  /** Public, approved feedback linked to the card (the 💡 count). */
  ideas: number;
  /** Approved public comments (team notes never count). */
  comments: number;
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
  const [tagRows, featureRows] = ids.length
    ? await Promise.all([
        display.showTags
          ? db
              .select({ cardId: cardTags.cardId, name: tags.name })
              .from(cardTags)
              .innerJoin(tags, eq(tags.id, cardTags.tagId))
              .where(inArray(cardTags.cardId, ids))
          : [],
        display.showFeatures
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
      ])
    : [[], []];

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
    ideas: r.ideas,
    comments: r.comments,
  }));
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
  const [columns, cards] = await Promise.all([
    db
      .select({
        id: roadmapColumns.id,
        name: roadmapColumns.name,
        isDone: roadmapColumns.isDone,
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
  ]);
  return {
    id: roadmap.id,
    slug: roadmap.slug,
    title: roadmap.publicTitle ?? roadmap.internalTitle,
    summary: roadmap.publicSummary,
    display,
    columns,
    cards,
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
    .select({ name: roadmapColumns.name })
    .from(roadmapColumns)
    .where(eq(roadmapColumns.id, card.columnId))
    .limit(1);
  return {
    card,
    columnName: column?.name ?? "",
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
function homeModule(ws: { modules: { roadmap: boolean } }) {
  return ws.modules.roadmap ? "roadmap" : "ideas";
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
