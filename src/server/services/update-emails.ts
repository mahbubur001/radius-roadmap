import { and, asc, eq, gt, isNull, notExists, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { renderRichText } from "@/lib/rich-text";
import type { Db } from "@/server/db/client";
import {
  emailSuppressions,
  organization,
  updateCategories,
  updateSubscribers,
  updates,
  workspaces,
} from "@/server/db/schema";
import type { EmailJob } from "@/server/email/types";
import { signLink } from "@/server/internal-signature";
import { fileUrl } from "@/server/storage/url";

// Emailing a published post to its workspace's subscribers (doc 23 step 5).
// Runs in the worker: no server-only imports. Idempotent: the post is
// "claimed" once (emailed_at), and each email job id is post + subscriber.

function origin() {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

/** Signed, never-expiring unsubscribe link for one subscriber. */
export function unsubscribeUrl(siteSlug: string, subscriberId: string) {
  const sig = signLink(env.BETTER_AUTH_SECRET, `unsub:${subscriberId}`);
  const url = new URL("/api/public/unsubscribe", origin());
  url.searchParams.set("site", siteSlug);
  url.searchParams.set("s", subscriberId);
  url.searchParams.set("sig", sig);
  return url.toString();
}

/**
 * Marks the post as emailed and returns what the emails need, or null when
 * it was already emailed, isn't published + public, or has emails off.
 */
export async function claimUpdateEmail(db: Db, updateId: string) {
  const [claimed] = await db
    .update(updates)
    .set({ emailedAt: new Date() })
    .where(
      and(
        eq(updates.id, updateId),
        isNull(updates.emailedAt),
        eq(updates.status, "published"),
        eq(updates.isPublic, true),
        eq(updates.emailSubscribers, true),
      ),
    )
    .returning({ id: updates.id });
  if (!claimed) return null;
  const [post] = await db
    .select({
      id: updates.id,
      accountId: updates.accountId,
      workspaceId: updates.workspaceId,
      slug: updates.slug,
      title: updates.title,
      bodyJson: updates.bodyJson,
      cover: updates.cover,
      categoryName: updateCategories.name,
      categoryColor: updateCategories.color,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      siteName: organization.name,
      siteSlug: organization.slug,
    })
    .from(updates)
    .innerJoin(workspaces, eq(workspaces.id, updates.workspaceId))
    .innerJoin(organization, eq(organization.id, updates.accountId))
    .leftJoin(updateCategories, eq(updateCategories.id, updates.categoryId))
    .where(eq(updates.id, updateId))
    .limit(1);
  return post ?? null;
}

export type ClaimedPost = NonNullable<
  Awaited<ReturnType<typeof claimUpdateEmail>>
>;

/** Active, not suppressed subscribers after `afterId`, in id order. */
export async function subscriberBatch(
  db: Db,
  post: ClaimedPost,
  afterId: string | null,
  limit = 500,
) {
  return db
    .select({ id: updateSubscribers.id, email: updateSubscribers.email })
    .from(updateSubscribers)
    .where(
      and(
        eq(updateSubscribers.accountId, post.accountId),
        eq(updateSubscribers.workspaceId, post.workspaceId),
        eq(updateSubscribers.status, "active"),
        afterId ? gt(updateSubscribers.id, afterId) : undefined,
        notExists(
          db
            .select({ one: sql`1` })
            .from(emailSuppressions)
            .where(
              and(
                eq(emailSuppressions.accountId, post.accountId),
                eq(emailSuppressions.email, updateSubscribers.email),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(updateSubscribers.id))
    .limit(limit);
}

/** Relative links and images (local storage) made absolute for email. */
function absolute(html: string) {
  return html.replace(/(src|href)="\//g, `$1="${origin()}/`);
}

export function updateEmail(
  post: ClaimedPost,
  sub: { id: string; email: string },
): EmailJob {
  const unsubscribe = unsubscribeUrl(post.siteSlug ?? "", sub.id);
  const cover = fileUrl(post.cover);
  return {
    template: "update-published",
    to: sub.email,
    props: {
      siteName: post.siteName,
      workspaceName: post.workspaceName,
      title: post.title,
      category:
        post.categoryName && post.categoryColor
          ? { name: post.categoryName, color: post.categoryColor }
          : null,
      html: absolute(renderRichText(post.bodyJson)),
      coverUrl: cover
        ? cover.startsWith("/")
          ? `${origin()}${cover}`
          : cover
        : null,
      url: `${origin()}/${post.siteSlug}/${post.workspaceSlug}/updates/${post.slug}`,
      unsubscribeUrl: unsubscribe,
    },
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
