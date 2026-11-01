import { sql } from "drizzle-orm";
import { workspaces } from "@/server/db/schema";

// Kept apart from public-site.ts: the worker (emails) needs it, and must
// not import anything "server-only" (see src/test/worker-imports.test.ts).

/**
 * Slug of the account's default (oldest) workspace, as a subquery.
 * `accountId` is a table-qualified column (`"organization"."id"`): Drizzle
 * renders columns unqualified in one-table selects (see roadmapIsPublic).
 */
export function defaultWorkspaceSlug(accountId: string) {
  return sql<
    string | null
  >`(select dw.slug from ${workspaces} dw where dw.account_id = ${sql.raw(accountId)} order by dw.created_at, dw.id limit 1)`;
}
