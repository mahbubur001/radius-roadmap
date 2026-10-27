import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export type WorkspaceSettings = {
  /** Require voters to sign in before voting/commenting/submitting. */
  requireVoterLogin?: boolean;
  darkModeDefault?: boolean;
  /** Let search engines index the public pages (on by default). */
  indexPublicPages?: boolean;
};

/**
 * A workspace is one product/project inside an account (Better Auth
 * organization). Every tenant table carries `accountId`, plus `workspaceId`
 * where it applies.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    slug: text().notNull(),
    settings: jsonb().$type<WorkspaceSettings>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("workspaces_account_id_idx").on(t.accountId),
    uniqueIndex("workspaces_account_slug_uq").on(t.accountId, t.slug),
  ],
);

export const workspacesRelations = relations(workspaces, ({ one }) => ({
  account: one(organization, {
    fields: [workspaces.accountId],
    references: [organization.id],
  }),
}));

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
