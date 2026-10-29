import { and, eq, ilike } from "drizzle-orm";
import { slugify } from "@/lib/schemas/workspace";
import type { Db, DbOrTx } from "@/server/db/client";
import { updates } from "@/server/db/schema";
import { NotFoundError } from "./context";

// Publishing, without request context (doc 23 step 3). Imported by the
// BullMQ worker, so it must not import anything "server-only" (storage,
// Next cache, …): keep this file to the database and pure helpers.

async function uniqueSlugExcept(
  db: DbOrTx,
  workspaceId: string,
  title: string,
  id: string,
) {
  const base = slugify(title) || "post";
  const rows = await db
    .select({ id: updates.id, slug: updates.slug })
    .from(updates)
    .where(
      and(
        eq(updates.workspaceId, workspaceId),
        ilike(updates.slug, `${base.replace(/[\\%_]/g, "\\$&")}%`),
      ),
    );
  const taken = new Set(rows.filter((r) => r.id !== id).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Publish a post now. On first publish the slug follows the final title. */
export async function publishNow(
  db: DbOrTx,
  post: typeof updates.$inferSelect,
) {
  const slug = post.publishedAt
    ? post.slug
    : await uniqueSlugExcept(db, post.workspaceId, post.title, post.id);
  const [row] = await db
    .update(updates)
    .set({
      status: "published",
      publishAt: null,
      publishedAt: post.publishedAt ?? new Date(),
      slug,
    })
    .where(eq(updates.id, post.id))
    .returning();
  if (!row) throw new NotFoundError("Post not found.");
  return row;
}

/**
 * Worker: publish a scheduled post if it's still scheduled for `at`.
 * Idempotent; a rescheduled or unpublished post is left alone.
 */
export async function publishDue(db: Db, updateId: string, at: Date) {
  const [post] = await db
    .select()
    .from(updates)
    .where(eq(updates.id, updateId))
    .limit(1);
  if (
    !post ||
    post.status !== "scheduled" ||
    post.publishAt?.getTime() !== at.getTime()
  ) {
    return null;
  }
  return publishNow(db, post);
}
