import { isNotNull, isNull, relations, type SQL, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { roadmapCards } from "./roadmaps";
import { trackedUsers } from "./tracked-users";
import { workspaces } from "./workspaces";

// Updates / changelog (doc 23). Same rules as the other modules: every row
// carries account_id (+ workspace_id) and is read through services.

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const accountId = () =>
  text()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
const workspaceId = () =>
  uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });

export const updateStatus = pgEnum("update_status", [
  "draft",
  "scheduled",
  "published",
]);

/** The four fixed reactions on a post (doc 23 U4). */
export const reactionEmoji = pgEnum("reaction_emoji", [
  "thumbs_up",
  "heart",
  "tada",
  "eyes",
]);

export const subscriberStatus = pgEnum("subscriber_status", [
  "pending",
  "active",
  "unsubscribed",
]);

export const subscriberSource = pgEnum("subscriber_source", [
  "public",
  "voter",
  "import",
]);

export const suppressionReason = pgEnum("suppression_reason", [
  "unsubscribed_all",
  "bounce",
  "complaint",
]);

/** Update categories, separate from roadmap objectives (doc 22 §1). */
export const updateCategories = pgTable(
  "update_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    name: text().notNull(),
    color: text().notNull(),
    position: text().notNull().$type<string>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("update_categories_workspace_name_uq").on(
      t.workspaceId,
      t.name,
    ),
  ],
);

export const updates = pgTable(
  "updates",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    slug: text().notNull(),
    title: text().notNull(),
    /** Tiptap JSON. */
    bodyJson: jsonb().$type<Record<string, unknown>>(),
    bodyText: text().notNull().default(""),
    /** Optional cover image (storage key). */
    cover: text(),
    categoryId: uuid().references(() => updateCategories.id, {
      onDelete: "set null",
    }),
    status: updateStatus().notNull().default("draft"),
    /** When a scheduled post goes live. */
    publishAt: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    isPublic: boolean().notNull().default(true),
    pinned: boolean().notNull().default(false),
    /** Email subscribers when published (doc 23 U2). */
    emailSubscribers: boolean().notNull().default(true),
    /** Set once the subscriber emails were queued; never re-sent. */
    emailedAt: timestamp({ withTimezone: true }),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    search: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', ${updates.title}), 'A') || setweight(to_tsvector('english', ${updates.bodyText}), 'B')`,
    ),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("updates_account_workspace_idx").on(t.accountId, t.workspaceId),
    index("updates_workspace_status_idx").on(
      t.workspaceId,
      t.status,
      t.publishedAt,
    ),
    uniqueIndex("updates_workspace_slug_uq").on(t.workspaceId, t.slug),
    index("updates_search_idx").using("gin", t.search),
  ],
);

/** Completed roadmap cards a post announces ("shipped"). */
export const updateCards = pgTable(
  "update_cards",
  {
    updateId: uuid()
      .notNull()
      .references(() => updates.id, { onDelete: "cascade" }),
    cardId: uuid()
      .notNull()
      .references(() => roadmapCards.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.updateId, t.cardId] }),
    index("update_cards_card_idx").on(t.cardId),
  ],
);

export const updateReactions = pgTable(
  "update_reactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    updateId: uuid()
      .notNull()
      .references(() => updates.id, { onDelete: "cascade" }),
    emoji: reactionEmoji().notNull(),
    trackedUserId: uuid().references(() => trackedUsers.id, {
      onDelete: "cascade",
    }),
    visitorId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("update_reactions_user_uq")
      .on(t.updateId, t.emoji, t.trackedUserId)
      .where(isNotNull(t.trackedUserId)),
    uniqueIndex("update_reactions_visitor_uq")
      .on(t.updateId, t.emoji, t.visitorId)
      .where(isNull(t.trackedUserId)),
    check(
      "update_reactions_voter_check",
      sql`num_nonnulls(${t.trackedUserId}, ${t.visitorId}) >= 1`,
    ),
  ],
);

export const updateSubscribers = pgTable(
  "update_subscribers",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    /** Always lowercased. */
    email: text().notNull(),
    trackedUserId: uuid().references(() => trackedUsers.id, {
      onDelete: "set null",
    }),
    status: subscriberStatus().notNull().default("pending"),
    /** SHA-256 of the confirm / unsubscribe token. */
    tokenHash: text().notNull(),
    source: subscriberSource().notNull().default("public"),
    confirmedAt: timestamp({ withTimezone: true }),
    unsubscribedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("update_subscribers_workspace_email_uq").on(
      t.workspaceId,
      t.email,
    ),
    uniqueIndex("update_subscribers_token_uq").on(t.tokenHash),
    index("update_subscribers_workspace_status_idx").on(
      t.workspaceId,
      t.status,
    ),
  ],
);

/** Addresses that get no email from this account (doc 23 U5). */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    accountId: accountId(),
    /** Always lowercased. */
    email: text().notNull(),
    reason: suppressionReason().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.email] })],
);

export const updatesRelations = relations(updates, ({ one, many }) => ({
  category: one(updateCategories, {
    fields: [updates.categoryId],
    references: [updateCategories.id],
  }),
  cards: many(updateCards),
}));

export const updateCardsRelations = relations(updateCards, ({ one }) => ({
  update: one(updates, {
    fields: [updateCards.updateId],
    references: [updates.id],
  }),
  card: one(roadmapCards, {
    fields: [updateCards.cardId],
    references: [roadmapCards.id],
  }),
}));

export type Update = typeof updates.$inferSelect;
export type UpdateCategory = typeof updateCategories.$inferSelect;
export type UpdateSubscriber = typeof updateSubscribers.$inferSelect;
export type ReactionEmoji = (typeof reactionEmoji.enumValues)[number];
