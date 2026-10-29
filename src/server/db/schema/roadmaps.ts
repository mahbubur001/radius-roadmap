import { isNotNull, relations, type SQL, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspaces } from "./workspaces";

// Roadmaps (doc 19 §3). Every row carries account_id + workspace_id and is
// read through src/server/services/*. Ordering uses fractional-index strings
// in `position`, compared with "C" collation so byte order wins.

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * Display toggles of a roadmap: `display` for the public site,
 * `internal_display` for the dashboard (doc 24 R2). Missing keys use
 * `defaultDisplay` / `defaultInternalDisplay`.
 */
export type RoadmapDisplay = {
  showTitle?: boolean;
  showSummary?: boolean;
  showAttachments?: boolean;
  showFeatureProgress?: boolean;
  showImageHeaders?: boolean;
  showVotes?: boolean;
  showObjectives?: boolean;
  showTags?: boolean;
  showDates?: boolean;
  showDescriptions?: boolean;
  showCompleted?: boolean;
  showFeatures?: boolean;
};

const accountId = () =>
  text()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
const workspaceId = () =>
  uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
const position = () => text().notNull().$type<string>();

export const roadmaps = pgTable(
  "roadmaps",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    slug: text().notNull(),
    internalTitle: text().notNull(),
    publicTitle: text(),
    /** Plain text of the summaries (previews); the JSON is the source. */
    internalSummary: text(),
    publicSummary: text(),
    /** Tiptap JSON (doc 24 R3). */
    internalSummaryJson: jsonb().$type<Record<string, unknown>>(),
    publicSummaryJson: jsonb().$type<Record<string, unknown>>(),
    isPublic: boolean().notNull().default(true),
    /** Email followers when a card is completed (doc 24 R4). */
    notifyOnComplete: boolean().notNull().default(true),
    position: position(),
    display: jsonb().$type<RoadmapDisplay>().notNull().default({}),
    internalDisplay: jsonb().$type<RoadmapDisplay>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("roadmaps_account_workspace_idx").on(t.accountId, t.workspaceId),
    uniqueIndex("roadmaps_workspace_slug_uq").on(t.workspaceId, t.slug),
  ],
);

export const roadmapColumns = pgTable(
  "roadmap_columns",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    roadmapId: uuid()
      .notNull()
      .references(() => roadmaps.id, { onDelete: "cascade" }),
    name: text().notNull(),
    position: position(),
    isPublic: boolean().notNull().default(true),
    /** Cards in this column count as completed ("Show completed"). */
    isDone: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("roadmap_columns_roadmap_idx").on(t.roadmapId)],
);

export const objectives = pgTable(
  "objectives",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    name: text().notNull(),
    color: text().notNull(),
    position: position(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("objectives_workspace_name_uq").on(t.workspaceId, t.name),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_workspace_name_uq").on(t.workspaceId, t.name)],
);

export const roadmapCards = pgTable(
  "roadmap_cards",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    roadmapId: uuid()
      .notNull()
      .references(() => roadmaps.id, { onDelete: "cascade" }),
    /**
     * NO ACTION: a column that still has cards can't be deleted, but deleting
     * the whole roadmap (which cascades to both) works.
     */
    columnId: uuid()
      .notNull()
      .references(() => roadmapColumns.id, { onDelete: "no action" }),
    slug: text().notNull(),
    title: text().notNull(),
    publicTitle: text(),
    /** Tiptap JSON. */
    summaryJson: jsonb().$type<Record<string, unknown>>(),
    /** Plain text of the summary, for previews and search. */
    summaryText: text().notNull().default(""),
    objectiveId: uuid().references(() => objectives.id, {
      onDelete: "set null",
    }),
    plannedFor: date({ mode: "string" }),
    isPublic: boolean().notNull().default(true),
    completedAt: timestamp({ withTimezone: true }),
    /** Followers were emailed about completion (once per card, doc 24 R4). */
    completionNotifiedAt: timestamp({ withTimezone: true }),
    /** Storage key of the card's header image (doc 24 R5). */
    headerImageKey: text(),
    archivedAt: timestamp({ withTimezone: true }),
    position: position(),
    /** Cached count of rows in `votes` (updated in the vote transaction). */
    voteCount: integer().notNull().default(0),
    /** Vote totals brought over from LoopedIn. Public total = both. */
    importedVotes: integer().notNull().default(0),
    /** Id in the system a card was imported from (idempotent imports). */
    externalRef: text(),
    search: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${roadmapCards.publicTitle}, ${roadmapCards.title})), 'A') || setweight(to_tsvector('english', ${roadmapCards.summaryText}), 'B')`,
    ),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("roadmap_cards_account_workspace_idx").on(t.accountId, t.workspaceId),
    index("roadmap_cards_column_idx").on(t.columnId),
    uniqueIndex("roadmap_cards_workspace_slug_uq").on(t.workspaceId, t.slug),
    uniqueIndex("roadmap_cards_roadmap_external_ref_uq")
      .on(t.roadmapId, t.externalRef)
      .where(isNotNull(t.externalRef)),
    index("roadmap_cards_search_idx").using("gin", t.search),
  ],
);

export const cardFeatures = pgTable(
  "card_features",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    cardId: uuid()
      .notNull()
      .references(() => roadmapCards.id, { onDelete: "cascade" }),
    title: text().notNull(),
    done: boolean().notNull().default(false),
    position: position(),
  },
  (t) => [index("card_features_card_idx").on(t.cardId)],
);

export const cardTags = pgTable(
  "card_tags",
  {
    cardId: uuid()
      .notNull()
      .references(() => roadmapCards.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.tagId] }),
    index("card_tags_tag_idx").on(t.tagId),
  ],
);

/** Files attached to a card (doc 21 step C). Team-only for now. */
export const cardAttachments = pgTable(
  "card_attachments",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    cardId: uuid()
      .notNull()
      .references(() => roadmapCards.id, { onDelete: "cascade" }),
    /** Storage key under prefixes.cardAttachments. */
    key: text().notNull(),
    /** Original file name, shown in the list. */
    name: text().notNull(),
    size: integer().notNull(),
    contentType: text().notNull(),
    uploadedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("card_attachments_card_idx").on(t.cardId, t.createdAt)],
);

/** Team members following a card. Follow emails come in Phase 4. */
export const cardFollows = pgTable(
  "card_follows",
  {
    accountId: accountId(),
    cardId: uuid()
      .notNull()
      .references(() => roadmapCards.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId] }),
    index("card_follows_user_idx").on(t.userId),
  ],
);

export const roadmapsRelations = relations(roadmaps, ({ many }) => ({
  columns: many(roadmapColumns),
  cards: many(roadmapCards),
}));

export const roadmapCardsRelations = relations(
  roadmapCards,
  ({ one, many }) => ({
    roadmap: one(roadmaps, {
      fields: [roadmapCards.roadmapId],
      references: [roadmaps.id],
    }),
    column: one(roadmapColumns, {
      fields: [roadmapCards.columnId],
      references: [roadmapColumns.id],
    }),
    objective: one(objectives, {
      fields: [roadmapCards.objectiveId],
      references: [objectives.id],
    }),
    features: many(cardFeatures),
    tags: many(cardTags),
  }),
);

export const roadmapColumnsRelations = relations(roadmapColumns, ({ one }) => ({
  roadmap: one(roadmaps, {
    fields: [roadmapColumns.roadmapId],
    references: [roadmaps.id],
  }),
}));

export const cardFeaturesRelations = relations(cardFeatures, ({ one }) => ({
  card: one(roadmapCards, {
    fields: [cardFeatures.cardId],
    references: [roadmapCards.id],
  }),
}));

export const cardTagsRelations = relations(cardTags, ({ one }) => ({
  card: one(roadmapCards, {
    fields: [cardTags.cardId],
    references: [roadmapCards.id],
  }),
  tag: one(tags, { fields: [cardTags.tagId], references: [tags.id] }),
}));

export type Roadmap = typeof roadmaps.$inferSelect;
export type RoadmapColumn = typeof roadmapColumns.$inferSelect;
export type RoadmapCard = typeof roadmapCards.$inferSelect;
export type CardAttachment = typeof cardAttachments.$inferSelect;
export type Objective = typeof objectives.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type CardFeature = typeof cardFeatures.$inferSelect;
