import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

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
    /** Storage key of the workspace logo (see src/server/storage). */
    logo: text(),
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

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  account: one(organization, {
    fields: [workspaces.accountId],
    references: [organization.id],
  }),
  members: many(workspaceMembers),
}));

/**
 * Which workspaces a "member" can open. Owners and admins see every
 * workspace in the account and have no rows here (doc 18 §3.1).
 */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_account_user_idx").on(t.accountId, t.userId),
  ],
);

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
