import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { planId } from "./billing";

// Platform admin (doc 28).

/**
 * A plan set by a platform admin (C4). While active (no end, or the end is in
 * the future) it wins over Stripe and Free.
 */
export const planOverrides = pgTable("plan_overrides", {
  accountId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  plan: planId().notNull(),
  /** null = until changed. */
  endsAt: timestamp({ withTimezone: true }),
  note: text(),
  /** Email of the admin who set it. */
  setBy: text().notNull(),
  /** Owner emails sent (C5), so the daily job sends each once. */
  warned7dAt: timestamp({ withTimezone: true }),
  warned1dAt: timestamp({ withTimezone: true }),
  endedNotifiedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Append-only record of every platform admin action (C9). */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    adminEmail: text().notNull(),
    action: text().notNull(),
    accountId: text().references(() => organization.id, {
      onDelete: "set null",
    }),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("admin_audit_log_account").on(t.accountId, t.createdAt),
    index("admin_audit_log_created").on(t.createdAt),
  ],
);
