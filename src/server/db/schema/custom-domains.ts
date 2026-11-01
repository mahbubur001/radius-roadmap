import { sql } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const domainStatus = pgEnum("domain_status", [
  "pending",
  "active",
  "failed",
]);

/**
 * An account's own domain for its public site (doc 26 6D, one per account).
 * Several accounts may have the same hostname pending; only the one that
 * proves ownership (TXT token, D2) can make it active.
 */
export const customDomains = pgTable(
  "custom_domains",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text()
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Lowercase, no trailing dot. */
    hostname: text().notNull(),
    status: domainStatus().notNull().default("pending"),
    /** Value of the `_radius-roadmap.<hostname>` TXT record. */
    verifyToken: text().notNull(),
    verifiedAt: timestamp({ withTimezone: true }),
    lastCheckedAt: timestamp({ withTimezone: true }),
    /** Failed daily checks in a row while active (3 → failed, D4). */
    failures: integer().notNull().default(0),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("custom_domains_active_hostname")
      .on(t.hostname)
      .where(sql`${t.status} = 'active'`),
  ],
);
