import { isNotNull, isNull, sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { feedbackItems } from "./feedback";
import { roadmapCards } from "./roadmaps";
import { trackedUsers } from "./tracked-users";
import { workspaces } from "./workspaces";

export const voteSource = pgEnum("vote_source", ["public", "embed", "admin"]);

/**
 * One row per voter per card or feedback item (doc 19 §3.6, doc 20 D1). Signed-in and guest voters are
 * deduplicated by tracked_user_id, anonymous visitors by visitor_id (from the
 * signed `rr_vid` cookie). The raw IP is never stored, only an HMAC.
 */
export const votes = pgTable(
  "votes",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Exactly one of cardId / feedbackId is set. */
    cardId: uuid().references(() => roadmapCards.id, { onDelete: "cascade" }),
    feedbackId: uuid().references(() => feedbackItems.id, {
      onDelete: "cascade",
    }),
    trackedUserId: uuid().references(() => trackedUsers.id, {
      onDelete: "cascade",
    }),
    visitorId: text(),
    ipHash: text(),
    country: text(),
    city: text(),
    source: voteSource().notNull().default("public"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("votes_card_user_uq")
      .on(t.cardId, t.trackedUserId)
      .where(isNotNull(t.trackedUserId)),
    uniqueIndex("votes_card_visitor_uq")
      .on(t.cardId, t.visitorId)
      .where(isNull(t.trackedUserId)),
    uniqueIndex("votes_feedback_user_uq")
      .on(t.feedbackId, t.trackedUserId)
      .where(isNotNull(t.trackedUserId)),
    uniqueIndex("votes_feedback_visitor_uq")
      .on(t.feedbackId, t.visitorId)
      .where(isNull(t.trackedUserId)),
    check(
      "votes_one_target_check",
      sql`num_nonnulls(${t.cardId}, ${t.feedbackId}) = 1`,
    ),
    index("votes_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("votes_visitor_idx").on(t.accountId, t.visitorId),
  ],
);

export const eventType = pgEnum("event_type", [
  "page_view",
  "card_view",
  "vote",
  "unvote",
  "feedback_view",
  "feedback_submit",
  "comment",
]);

/** Analytics v1 (doc 19 §3.7). Charts query this directly for now. */
export const events = pgTable(
  "events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: eventType().notNull(),
    subjectId: uuid(),
    visitorId: text(),
    country: text(),
    city: text(),
    source: voteSource().notNull().default("public"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_workspace_created_idx").on(t.workspaceId, t.createdAt)],
);

/** Magic-link sign-in for voters: 6-digit code + one-time link token. */
export const voterLoginCodes = pgTable(
  "voter_login_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text().notNull(),
    codeHash: text().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    attempts: integer().notNull().default(0),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("voter_login_codes_account_email_idx").on(t.accountId, t.email),
  ],
);

export type Vote = typeof votes.$inferSelect;
export type VoteSource = (typeof voteSource.enumValues)[number];
export type EventType = (typeof eventType.enumValues)[number];
