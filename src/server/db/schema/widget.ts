import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * The account's key for signing widget identity tokens (HS256 JWT, doc 26
 * P10). One per account; rotating it signs everyone out of the widget.
 */
export const widgetKeys = pgTable("widget_keys", {
  accountId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  secret: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
