import { isNotNull } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * How a voter was last identified. "email" = verified by magic link.
 * Anonymous voters are not rows; votes store a hashed visitor id instead.
 */
export const trackedUserKind = pgEnum("tracked_user_kind", [
  "guest",
  "email",
  "social",
  "sso",
  "widget",
]);

/**
 * End users (voters, commenters) of an account's public pages and widget.
 * Never stored in Better Auth's `user` table (doc 18 §3.5).
 */
export const trackedUsers = pgTable(
  "tracked_users",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: trackedUserKind().notNull(),
    /** Always lowercased. */
    email: text(),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    name: text(),
    avatarUrl: text(),
    /** Customer SSO subject or widget `user.id`. */
    externalId: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tracked_users_account_email_uq")
      .on(t.accountId, t.email)
      .where(isNotNull(t.email)),
    uniqueIndex("tracked_users_account_external_id_uq")
      .on(t.accountId, t.externalId)
      .where(isNotNull(t.externalId)),
  ],
);

/** Signed-in voter sessions. Only a SHA-256 of the cookie token is stored. */
export const trackedUserSessions = pgTable(
  "tracked_user_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    trackedUserId: uuid()
      .notNull()
      .references(() => trackedUsers.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tracked_user_sessions_user_idx").on(t.trackedUserId)],
);

export type TrackedUser = typeof trackedUsers.$inferSelect;
export type TrackedUserKind = (typeof trackedUserKind.enumValues)[number];
