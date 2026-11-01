import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

// Public REST API keys and outgoing webhooks (doc 27).

export const apiKeyPermission = pgEnum("api_key_permission", ["read", "write"]);

/**
 * An account's API key (A1, A2). Only a SHA-256 hash is stored; the key is
 * shown once. It acts as its creator with the admin role (A3), so it stops
 * working when that person is no longer an owner or admin of the account.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** Start of the key, shown in the list (`rr_live_ab12cd34`). */
    prefix: text().notNull(),
    keyHash: text().notNull().unique(),
    permission: apiKeyPermission().notNull().default("read"),
    createdBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Updated at most once a minute. */
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_account").on(t.accountId)],
);

/** Where an account wants events delivered (A8–A10). */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text().notNull(),
    description: text(),
    /** Event names it receives, e.g. `feedback.created`. */
    events: text().array().notNull(),
    /** HMAC-SHA256 signing secret (A9). */
    secret: text().notNull(),
    enabled: boolean().notNull().default(true),
    /** Why it was switched off automatically (A10). */
    disabledReason: text(),
    /** First failed delivery since the last success. */
    failingSince: timestamp({ withTimezone: true }),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_endpoints_account").on(t.accountId)],
);

export const deliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "success",
  "failed",
]);

/** One event sent (or being sent) to one endpoint. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid().primaryKey().defaultRandom(),
    endpointId: uuid()
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text().notNull(),
    /** Same for every endpoint that got this event (`evt_…`). */
    eventId: text().notNull(),
    payload: jsonb().notNull(),
    status: deliveryStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    responseStatus: integer(),
    /** First 1 KB of the response body, or the network error. */
    responseSnippet: text(),
    durationMs: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("webhook_deliveries_endpoint").on(t.endpointId, t.createdAt)],
);
