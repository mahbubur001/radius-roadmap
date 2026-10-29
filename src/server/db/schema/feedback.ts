import { isNotNull, relations, type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { objectives, roadmapCards, tags } from "./roadmaps";
import { trackedUsers } from "./tracked-users";
import { workspaces } from "./workspaces";

// Feedback boards (doc 20 §3). Same rules as roadmaps: every row carries
// account_id + workspace_id and is read through src/server/services/*.

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
const position = () => text().notNull().$type<string>();

export const feedbackStatusKind = pgEnum("feedback_status_kind", [
  "open",
  "planned",
  "in_progress",
  "done",
  "declined",
]);

/** pending = waiting in the triage inbox; only approved items are public. */
export const feedbackReview = pgEnum("feedback_review", [
  "pending",
  "approved",
  "rejected",
]);

export const feedbackSource = pgEnum("feedback_source", [
  "public",
  "embed",
  "admin",
  "import",
]);

export const commentReview = pgEnum("comment_review", ["approved", "pending"]);

export const notificationFrequency = pgEnum("notification_frequency", [
  "instant",
  "daily",
  "off",
]);

export const feedbackBoards = pgTable(
  "feedback_boards",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    isPublic: boolean().notNull().default(true),
    /** Publish new public submissions without triage. */
    autoPublish: boolean().notNull().default(false),
    position: position(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("feedback_boards_account_workspace_idx").on(
      t.accountId,
      t.workspaceId,
    ),
    uniqueIndex("feedback_boards_workspace_slug_uq").on(t.workspaceId, t.slug),
  ],
);

export const feedbackStatuses = pgTable(
  "feedback_statuses",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    name: text().notNull(),
    color: text().notNull(),
    kind: feedbackStatusKind().notNull(),
    position: position(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("feedback_statuses_workspace_name_uq").on(
      t.workspaceId,
      t.name,
    ),
  ],
);

export const feedbackItems = pgTable(
  "feedback_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    /** NO ACTION: move the items before deleting a board. */
    boardId: uuid()
      .notNull()
      .references(() => feedbackBoards.id, { onDelete: "no action" }),
    slug: text().notNull(),
    title: text().notNull(),
    /** Tiptap JSON. Plain-text submissions are stored as one paragraph. */
    summaryJson: jsonb().$type<Record<string, unknown>>(),
    summaryText: text().notNull().default(""),
    /** NO ACTION: a status in use can't be deleted. */
    statusId: uuid()
      .notNull()
      .references(() => feedbackStatuses.id, { onDelete: "no action" }),
    /**
     * The status followers were last emailed about (doc 23 step 6). A sweep
     * emails them when status_id moves away from it.
     */
    notifiedStatusId: uuid().references(() => feedbackStatuses.id, {
      onDelete: "set null",
    }),
    objectiveId: uuid().references(() => objectives.id, {
      onDelete: "set null",
    }),
    isPublic: boolean().notNull().default(true),
    review: feedbackReview().notNull().default("pending"),
    /** 1–5 (XS–XL). Priority score is computed in SQL (doc 03). */
    impact: smallint(),
    effort: smallint(),
    /** Cached count of rows in `votes`. Public total = both. */
    voteCount: integer().notNull().default(0),
    importedVotes: integer().notNull().default(0),
    /** Cached count of approved, non-internal comments. */
    commentCount: integer().notNull().default(0),
    authorTrackedUserId: uuid().references(() => trackedUsers.id, {
      onDelete: "set null",
    }),
    authorUserId: text().references(() => user.id, { onDelete: "set null" }),
    source: feedbackSource().notNull().default("admin"),
    mergedIntoId: uuid().references((): AnyPgColumn => feedbackItems.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
    externalRef: text(),
    search: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', ${feedbackItems.title}), 'A') || setweight(to_tsvector('english', ${feedbackItems.summaryText}), 'B')`,
    ),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("feedback_items_account_workspace_idx").on(
      t.accountId,
      t.workspaceId,
    ),
    index("feedback_items_board_review_idx").on(
      t.workspaceId,
      t.boardId,
      t.review,
    ),
    index("feedback_items_inbox_idx").on(t.workspaceId, t.review, t.createdAt),
    uniqueIndex("feedback_items_workspace_slug_uq").on(t.workspaceId, t.slug),
    uniqueIndex("feedback_items_workspace_external_ref_uq")
      .on(t.workspaceId, t.externalRef)
      .where(isNotNull(t.externalRef)),
    index("feedback_items_search_idx").using("gin", t.search),
    check(
      "feedback_items_impact_check",
      sql`${t.impact} is null or ${t.impact} between 1 and 5`,
    ),
    check(
      "feedback_items_effort_check",
      sql`${t.effort} is null or ${t.effort} between 1 and 5`,
    ),
  ],
);

export const feedbackTags = pgTable(
  "feedback_tags",
  {
    feedbackId: uuid()
      .notNull()
      .references(() => feedbackItems.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.feedbackId, t.tagId] }),
    index("feedback_tags_tag_idx").on(t.tagId),
  ],
);

/** Feedback pushed to / linked with a roadmap card (the 💡 on public cards). */
export const cardFeedbackLinks = pgTable(
  "card_feedback_links",
  {
    accountId: accountId(),
    workspaceId: workspaceId(),
    cardId: uuid()
      .notNull()
      .references(() => roadmapCards.id, { onDelete: "cascade" }),
    feedbackId: uuid()
      .notNull()
      .references(() => feedbackItems.id, { onDelete: "cascade" }),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.feedbackId] }),
    index("card_feedback_links_feedback_idx").on(t.feedbackId),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    /** Exactly one of feedbackId / cardId is set (card comments: doc 21). */
    feedbackId: uuid().references(() => feedbackItems.id, {
      onDelete: "cascade",
    }),
    cardId: uuid().references(() => roadmapCards.id, { onDelete: "cascade" }),
    /** Plain text; URLs are auto-linked when rendered. */
    body: text().notNull(),
    authorTrackedUserId: uuid().references(() => trackedUsers.id, {
      onDelete: "set null",
    }),
    authorUserId: text().references(() => user.id, { onDelete: "set null" }),
    /** Team note: never shown publicly. */
    isInternal: boolean().notNull().default(false),
    review: commentReview().notNull().default("approved"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("comments_feedback_created_idx").on(t.feedbackId, t.createdAt),
    index("comments_card_created_idx").on(t.cardId, t.createdAt),
    index("comments_workspace_review_idx").on(t.workspaceId, t.review),
    check(
      "comments_one_target",
      sql`num_nonnulls(${t.feedbackId}, ${t.cardId}) = 1`,
    ),
  ],
);

export const follows = pgTable(
  "follows",
  {
    accountId: accountId(),
    feedbackId: uuid()
      .notNull()
      .references(() => feedbackItems.id, { onDelete: "cascade" }),
    trackedUserId: uuid()
      .notNull()
      .references(() => trackedUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.feedbackId, t.trackedUserId] }),
    index("follows_tracked_user_idx").on(t.trackedUserId),
  ],
);

/** A team member's email preferences per workspace. No row = role default. */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    accountId: accountId(),
    workspaceId: workspaceId(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    newFeedback: notificationFrequency().notNull(),
    newComment: notificationFrequency().notNull(),
    /** Phase 4 (doc 23): a new confirmed update subscriber. */
    newSubscriber: notificationFrequency().notNull().default("off"),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.workspaceId] })],
);

export const feedbackBoardsRelations = relations(
  feedbackBoards,
  ({ many }) => ({ items: many(feedbackItems) }),
);

export const feedbackItemsRelations = relations(
  feedbackItems,
  ({ one, many }) => ({
    board: one(feedbackBoards, {
      fields: [feedbackItems.boardId],
      references: [feedbackBoards.id],
    }),
    status: one(feedbackStatuses, {
      fields: [feedbackItems.statusId],
      references: [feedbackStatuses.id],
    }),
    objective: one(objectives, {
      fields: [feedbackItems.objectiveId],
      references: [objectives.id],
    }),
    tags: many(feedbackTags),
    cardLinks: many(cardFeedbackLinks),
  }),
);

export const feedbackTagsRelations = relations(feedbackTags, ({ one }) => ({
  feedback: one(feedbackItems, {
    fields: [feedbackTags.feedbackId],
    references: [feedbackItems.id],
  }),
  tag: one(tags, { fields: [feedbackTags.tagId], references: [tags.id] }),
}));

export const cardFeedbackLinksRelations = relations(
  cardFeedbackLinks,
  ({ one }) => ({
    card: one(roadmapCards, {
      fields: [cardFeedbackLinks.cardId],
      references: [roadmapCards.id],
    }),
    feedback: one(feedbackItems, {
      fields: [cardFeedbackLinks.feedbackId],
      references: [feedbackItems.id],
    }),
  }),
);

export type FeedbackBoard = typeof feedbackBoards.$inferSelect;
export type FeedbackStatus = typeof feedbackStatuses.$inferSelect;
export type FeedbackStatusKind = (typeof feedbackStatusKind.enumValues)[number];
export type FeedbackItem = typeof feedbackItems.$inferSelect;
export type FeedbackReview = (typeof feedbackReview.enumValues)[number];
export type Comment = typeof comments.$inferSelect;
export type NotificationFrequency =
  (typeof notificationFrequency.enumValues)[number];
