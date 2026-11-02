import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { cardFeedbackLinks, updateCards, updates } from "@/server/db/schema";

// "Announced" for the stage tick (doc 30 R1/R2), as SQL to select alongside
// a card or idea. Updates and cards always share the workspace, so matching
// by id is enough; callers scope the outer query to the tenant.

/** The card is in a published update. */
export function cardAnnouncedSql(cardId: AnyPgColumn) {
  return sql<boolean>`exists (
    select 1 from ${updateCards}
    join ${updates} on ${updates.id} = ${updateCards.updateId}
    where ${updateCards.cardId} = ${cardId} and ${updates.status} = 'published'
  )`;
}

/** A card linked to the idea is in a published update. */
export function feedbackAnnouncedSql(feedbackId: AnyPgColumn) {
  return sql<boolean>`exists (
    select 1 from ${cardFeedbackLinks}
    join ${updateCards} on ${updateCards.cardId} = ${cardFeedbackLinks.cardId}
    join ${updates} on ${updates.id} = ${updateCards.updateId}
    where ${cardFeedbackLinks.feedbackId} = ${feedbackId}
      and ${updates.status} = 'published'
  )`;
}
