import { and, eq, inArray, isNull } from "drizzle-orm";
import Papa from "papaparse";
import type { Db } from "@/server/db/client";
import { cardTags, objectives, roadmapCards, tags } from "@/server/db/schema";
import type { WorkspaceContext } from "./context";
import { byPosition } from "./positions";
import { getRoadmap, inWorkspace, listColumns } from "./roadmaps";

// "More → Export" on the roadmap board (doc 21 step C): one CSV row per
// unarchived card, in board order.

const FIELDS = [
  "Title",
  "Public title",
  "Column",
  "Objective",
  "Tags",
  "Votes",
  "Planned for",
  "Public",
  "Completed",
  "Created",
  "Summary",
] as const;

/** Cells starting with these could run as formulas in a spreadsheet. */
const FORMULA = /^[=+\-@\t\r]/;

function cell(value: string) {
  return FORMULA.test(value) ? `'${value}` : value;
}

export async function exportRoadmapCsv(
  db: Db,
  ctx: WorkspaceContext,
  roadmapId: string,
) {
  const roadmap = await getRoadmap(db, ctx, roadmapId);
  const [columns, cards] = await Promise.all([
    listColumns(db, ctx, roadmapId),
    db
      .select({
        id: roadmapCards.id,
        columnId: roadmapCards.columnId,
        title: roadmapCards.title,
        publicTitle: roadmapCards.publicTitle,
        summaryText: roadmapCards.summaryText,
        objective: objectives.name,
        voteCount: roadmapCards.voteCount,
        importedVotes: roadmapCards.importedVotes,
        plannedFor: roadmapCards.plannedFor,
        isPublic: roadmapCards.isPublic,
        completedAt: roadmapCards.completedAt,
        createdAt: roadmapCards.createdAt,
      })
      .from(roadmapCards)
      .leftJoin(objectives, eq(objectives.id, roadmapCards.objectiveId))
      .where(
        and(
          inWorkspace(roadmapCards, ctx),
          eq(roadmapCards.roadmapId, roadmapId),
          isNull(roadmapCards.archivedAt),
        ),
      )
      .orderBy(byPosition(roadmapCards.position)),
  ]);

  const tagRows = cards.length
    ? await db
        .select({ cardId: cardTags.cardId, name: tags.name })
        .from(cardTags)
        .innerJoin(tags, eq(tags.id, cardTags.tagId))
        .where(
          inArray(
            cardTags.cardId,
            cards.map((c) => c.id),
          ),
        )
    : [];

  const order = new Map(columns.map((c, i) => [c.id, i]));
  const columnName = new Map(columns.map((c) => [c.id, c.name]));
  const rows = [...cards]
    .sort((a, b) => (order.get(a.columnId) ?? 0) - (order.get(b.columnId) ?? 0))
    .map((c) => ({
      Title: cell(c.title),
      "Public title": cell(c.publicTitle ?? ""),
      Column: cell(columnName.get(c.columnId) ?? ""),
      Objective: cell(c.objective ?? ""),
      Tags: cell(
        tagRows
          .filter((t) => t.cardId === c.id)
          .map((t) => t.name)
          .join(", "),
      ),
      Votes: c.voteCount + c.importedVotes,
      "Planned for": c.plannedFor ?? "",
      Public: c.isPublic ? "yes" : "no",
      Completed: c.completedAt ? "yes" : "no",
      Created: c.createdAt.toISOString().slice(0, 10),
      Summary: cell(c.summaryText),
    }));

  return {
    filename: `${roadmap.slug}-${new Date().toISOString().slice(0, 10)}.csv`,
    // Fields + arrays, so an empty roadmap still gets the header row.
    csv: Papa.unparse(
      {
        fields: [...FIELDS],
        data: rows.map((r) => FIELDS.map((f) => r[f])),
      },
      { newline: "\r\n" },
    ),
  };
}
