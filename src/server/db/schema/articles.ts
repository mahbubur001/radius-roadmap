import { isNotNull, isNull, relations, type SQL, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { trackedUsers } from "./tracked-users";
import { workspaces } from "./workspaces";

// Articles / knowledge base (doc 25). One knowledge base per workspace (A1).
// Every row carries account_id (+ workspace_id) and is read through services.

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

export const articleStatus = pgEnum("article_status", ["draft", "published"]);

/** "Was this helpful?" (doc 25 A4). */
export const articleRatingValue = pgEnum("article_rating_value", [
  "dislike",
  "neutral",
  "like",
]);

export const articleCategories = pgTable(
  "article_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(""),
    /** One emoji (doc 25 A5). */
    icon: text().notNull().default("📄"),
    position: position(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("article_categories_workspace_slug_uq").on(
      t.workspaceId,
      t.slug,
    ),
    uniqueIndex("article_categories_workspace_name_uq").on(
      t.workspaceId,
      t.name,
    ),
  ],
);

export const articles = pgTable(
  "articles",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    workspaceId: workspaceId(),
    categoryId: uuid().references(() => articleCategories.id, {
      onDelete: "set null",
    }),
    slug: text().notNull(),
    title: text().notNull(),
    /** Shown in lists; empty = the first lines of the body. */
    excerpt: text().notNull().default(""),
    /** Tiptap JSON. */
    bodyJson: jsonb().$type<Record<string, unknown>>(),
    bodyText: text().notNull().default(""),
    status: articleStatus().notNull().default("draft"),
    isPublic: boolean().notNull().default(true),
    featured: boolean().notNull().default(false),
    /** Order within its category. */
    position: position(),
    publishedAt: timestamp({ withTimezone: true }),
    /** Cached rating counts (updated in the rating transaction). */
    likes: integer().notNull().default(0),
    neutrals: integer().notNull().default(0),
    dislikes: integer().notNull().default(0),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    updatedBy: text().references(() => user.id, { onDelete: "set null" }),
    search: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', ${articles.title}), 'A') || setweight(to_tsvector('english', ${articles.bodyText}), 'B')`,
    ),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("articles_account_workspace_idx").on(t.accountId, t.workspaceId),
    index("articles_workspace_status_idx").on(
      t.workspaceId,
      t.status,
      t.publishedAt,
    ),
    uniqueIndex("articles_workspace_slug_uq").on(t.workspaceId, t.slug),
    index("articles_search_idx").using("gin", t.search),
  ],
);

export const articleRatings = pgTable(
  "article_ratings",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: accountId(),
    articleId: uuid()
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    value: articleRatingValue().notNull(),
    trackedUserId: uuid().references(() => trackedUsers.id, {
      onDelete: "cascade",
    }),
    visitorId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("article_ratings_user_uq")
      .on(t.articleId, t.trackedUserId)
      .where(isNotNull(t.trackedUserId)),
    uniqueIndex("article_ratings_visitor_uq")
      .on(t.articleId, t.visitorId)
      .where(isNull(t.trackedUserId)),
    check(
      "article_ratings_voter_check",
      sql`num_nonnulls(${t.trackedUserId}, ${t.visitorId}) >= 1`,
    ),
  ],
);

export const articlesRelations = relations(articles, ({ one }) => ({
  category: one(articleCategories, {
    fields: [articles.categoryId],
    references: [articleCategories.id],
  }),
}));

export type Article = typeof articles.$inferSelect;
export type ArticleCategory = typeof articleCategories.$inferSelect;
export type ArticleRatingValue = (typeof articleRatingValue.enumValues)[number];
