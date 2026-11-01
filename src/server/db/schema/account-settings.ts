import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * Account branding (doc 26 6C). The logo is `organization.logo`. Values the
 * plan lacks stay saved and are ignored until it includes them again (B7).
 */
export type AccountBranding = {
  /** Storage key (PNG/JPEG/WebP). */
  favicon?: string | null;
  /** Hex brand colour. */
  color?: string | null;
  /** Font id from src/lib/fonts.ts. */
  font?: string | null;
  hidePoweredBy?: boolean;
};

export const accountSettings = pgTable("account_settings", {
  accountId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  branding: jsonb().$type<AccountBranding>().notNull().default({}),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
