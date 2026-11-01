import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const planId = pgEnum("plan_id", [
  "free",
  "startup",
  "pro",
  "enterprise",
]);

/**
 * The account's subscription, mirrored from Stripe webhooks (doc 26 §3).
 * No row = Free. `status` is Stripe's subscription status.
 */
export const accountBilling = pgTable("account_billing", {
  accountId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  plan: planId().notNull().default("free"),
  /** `month` | `year`; null on Free. */
  interval: text(),
  status: text(),
  stripeCustomerId: text().unique(),
  stripeSubscriptionId: text().unique(),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  cancelAtPeriodEnd: boolean().notNull().default(false),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Stripe events already applied; webhooks are retried and can repeat. */
export const stripeEvents = pgTable("stripe_events", {
  id: text().primaryKey(),
  type: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
