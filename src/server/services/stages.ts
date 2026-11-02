import { getTableName, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { cardFeedbackLinks, updateCards, updates } from "@/server/db/schema";

// "Announced" for the stage tick (doc 30 R1/R2), as SQL to select alongside
// a card or idea. Updates and cards always share the workspace, so matching
// by id is enough; callers scope the outer query to the tenant.

/**
 * `"table"."column"`: Drizzle leaves columns unqualified when the outer query
 * has one table, which is ambiguous inside these subqueries.
 */
function q(column: AnyPgColumn) {
  // Schema keys are camelCase; the database is snake_case (casing setting).
  const name = column.name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return sql.raw(`"${getTableName(column.table)}"."${name}"`);
}

/** The card is in a published update. */
export function cardAnnouncedSql(cardId: AnyPgColumn) {
  return sql<boolean>`exists (
    select 1 from ${updateCards}
    join ${updates} on ${q(updates.id)} = ${q(updateCards.updateId)}
    where ${q(updateCards.cardId)} = ${q(cardId)}
      and ${q(updates.status)} = 'published'
  )`;
}

/** A card linked to the idea is in a published update. */
export function feedbackAnnouncedSql(feedbackId: AnyPgColumn) {
  return sql<boolean>`exists (
    select 1 from ${cardFeedbackLinks}
    join ${updateCards} on ${q(updateCards.cardId)} = ${q(cardFeedbackLinks.cardId)}
    join ${updates} on ${q(updates.id)} = ${q(updateCards.updateId)}
    where ${q(cardFeedbackLinks.feedbackId)} = ${q(feedbackId)}
      and ${q(updates.status)} = 'published'
  )`;
}
