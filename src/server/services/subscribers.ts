import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import {
  emailSuppressions,
  updateSubscribers,
  workspaces,
} from "@/server/db/schema";
import { likePattern } from "./cards";
import {
  NotFoundError,
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import { inWorkspace } from "./roadmaps";

// Update subscribers (doc 23 step 4, U1). Double opt-in: a confirmation
// email, then active; verified voters skip it. One token per subscriber
// (only its SHA-256 is stored) confirms and unsubscribes. Worker-safe: no
// server-only imports.

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return randomBytes(24).toString("base64url");
}

export type SubscribeResult =
  /** Confirmation email needed: send `token`. */
  | { status: "pending"; id: string; token: string }
  /** Already (or now) active; nothing to send. */
  | { status: "active"; id: string; activated: boolean };

/**
 * Subscribe `email` to a workspace's updates. Re-subscribing clears a
 * previous "stop all emails" (it's a new, explicit request) but never a
 * bounce or complaint.
 */
export async function subscribe(
  db: Db,
  ctx: PublicContext,
  input: {
    workspaceId: string;
    email: string;
    trackedUserId?: string | null;
    /** The email is already verified (logged-in voter): skip opt-in. */
    verified: boolean;
  },
): Promise<SubscribeResult> {
  const email = input.email.trim().toLowerCase();
  const [blocked] = await db
    .select({ reason: emailSuppressions.reason })
    .from(emailSuppressions)
    .where(
      and(
        eq(emailSuppressions.accountId, ctx.accountId),
        eq(emailSuppressions.email, email),
      ),
    )
    .limit(1);
  if (blocked && blocked.reason !== "unsubscribed_all") {
    // Bounced or complained: pretend all is well, send nothing.
    return { status: "active", id: "", activated: false };
  }
  if (blocked) {
    await db
      .delete(emailSuppressions)
      .where(
        and(
          eq(emailSuppressions.accountId, ctx.accountId),
          eq(emailSuppressions.email, email),
        ),
      );
  }

  const token = newToken();
  const [existing] = await db
    .select()
    .from(updateSubscribers)
    .where(
      and(
        eq(updateSubscribers.accountId, ctx.accountId),
        eq(updateSubscribers.workspaceId, input.workspaceId),
        eq(updateSubscribers.email, email),
      ),
    )
    .limit(1);
  if (existing?.status === "active") {
    return { status: "active", id: existing.id, activated: false };
  }

  const status: "active" | "pending" = input.verified ? "active" : "pending";
  const values = {
    status,
    tokenHash: hashToken(token),
    trackedUserId: input.trackedUserId ?? existing?.trackedUserId ?? null,
    source: input.trackedUserId ? ("voter" as const) : ("public" as const),
    confirmedAt: input.verified ? new Date() : null,
    unsubscribedAt: null,
  };
  const [row] = existing
    ? await db
        .update(updateSubscribers)
        .set(values)
        .where(eq(updateSubscribers.id, existing.id))
        .returning({ id: updateSubscribers.id })
    : await db
        .insert(updateSubscribers)
        .values({
          accountId: ctx.accountId,
          workspaceId: input.workspaceId,
          email,
          ...values,
        })
        .returning({ id: updateSubscribers.id });
  if (!row) throw new Error("Failed to subscribe.");
  return status === "active"
    ? { status: "active", id: row.id, activated: true }
    : { status: "pending", id: row.id, token };
}

async function byToken(db: Db, ctx: PublicContext, token: string) {
  return findSubscription(
    db,
    ctx,
    eq(updateSubscribers.tokenHash, hashToken(token)),
  );
}

/** The subscription behind a signed email link (`s` = subscriber id). */
export async function subscriptionById(db: Db, ctx: PublicContext, id: string) {
  return findSubscription(db, ctx, eq(updateSubscribers.id, id));
}

async function findSubscription(db: Db, ctx: PublicContext, match: SQL) {
  const [row] = await db
    .select({
      id: updateSubscribers.id,
      status: updateSubscribers.status,
      email: updateSubscribers.email,
      workspaceId: updateSubscribers.workspaceId,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
    })
    .from(updateSubscribers)
    .innerJoin(workspaces, eq(workspaces.id, updateSubscribers.workspaceId))
    .where(and(eq(updateSubscribers.accountId, ctx.accountId), match))
    .limit(1);
  return row ?? null;
}

/** Confirm a pending subscription. Returns the subscriber, or null. */
export async function confirmSubscription(
  db: Db,
  ctx: PublicContext,
  token: string,
) {
  const sub = await byToken(db, ctx, token);
  if (!sub || sub.status === "unsubscribed") return null;
  const activated = sub.status === "pending";
  if (activated) {
    await db
      .update(updateSubscribers)
      .set({ status: "active", confirmedAt: new Date() })
      .where(eq(updateSubscribers.id, sub.id));
  }
  return { ...sub, activated };
}

/** The subscription a link is for (unsubscribe page), or null. */
export async function subscriptionForToken(
  db: Db,
  ctx: PublicContext,
  token: string,
) {
  return byToken(db, ctx, token);
}

/**
 * Unsubscribe; with `everything`, also stop every other email this account
 * sends to the address (updates of other workspaces, follow emails).
 */
export async function unsubscribe(
  db: Db,
  ctx: PublicContext,
  link: { token: string } | { id: string },
  everything = false,
) {
  const sub =
    "token" in link
      ? await byToken(db, ctx, link.token)
      : await subscriptionById(db, ctx, link.id);
  if (!sub) return null;
  await db
    .update(updateSubscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(updateSubscribers.id, sub.id));
  if (everything) await suppress(db, ctx, sub.email, "unsubscribed_all");
  return sub;
}

export async function suppress(
  db: Db,
  ctx: PublicContext,
  email: string,
  reason: "unsubscribed_all" | "bounce" | "complaint",
) {
  await db
    .insert(emailSuppressions)
    .values({ accountId: ctx.accountId, email: email.toLowerCase(), reason })
    .onConflictDoNothing();
}

export async function isSuppressed(db: Db, ctx: PublicContext, email: string) {
  const [row] = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(
      and(
        eq(emailSuppressions.accountId, ctx.accountId),
        eq(emailSuppressions.email, email.toLowerCase()),
      ),
    )
    .limit(1);
  return !!row;
}

// ── Dashboard ───────────────────────────────────────────────────────────

export const SUBSCRIBER_STATUSES = [
  "active",
  "pending",
  "unsubscribed",
] as const;

export async function listSubscribers(
  db: Db,
  ctx: WorkspaceContext,
  filter: { q?: string; status?: (typeof SUBSCRIBER_STATUSES)[number] } = {},
) {
  const where: SQL[] = [inWorkspace(updateSubscribers, ctx)];
  if (filter.status) where.push(eq(updateSubscribers.status, filter.status));
  if (filter.q)
    where.push(ilike(updateSubscribers.email, likePattern(filter.q)));
  return db
    .select({
      id: updateSubscribers.id,
      email: updateSubscribers.email,
      status: updateSubscribers.status,
      source: updateSubscribers.source,
      confirmedAt: updateSubscribers.confirmedAt,
      createdAt: updateSubscribers.createdAt,
    })
    .from(updateSubscribers)
    .where(and(...where))
    .orderBy(desc(updateSubscribers.createdAt))
    .limit(5000);
}

export type SubscriberRow = Awaited<ReturnType<typeof listSubscribers>>[number];

export async function subscriberCounts(db: Db, ctx: WorkspaceContext) {
  const rows = await db
    .select({ status: updateSubscribers.status, n: count() })
    .from(updateSubscribers)
    .where(inWorkspace(updateSubscribers, ctx))
    .groupBy(updateSubscribers.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<
    Record<(typeof SUBSCRIBER_STATUSES)[number], number>
  >;
}

/** Removes a subscriber entirely (they can subscribe again). */
export async function removeSubscriber(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const [row] = await db
    .delete(updateSubscribers)
    .where(
      and(inWorkspace(updateSubscribers, ctx), eq(updateSubscribers.id, id)),
    )
    .returning({ id: updateSubscribers.id });
  if (!row) throw new NotFoundError("Subscriber not found.");
}

/** CSV of the workspace's subscribers (formula cells neutralised). */
export async function subscribersCsv(db: Db, ctx: WorkspaceContext) {
  const rows = await listSubscribers(db, ctx);
  const cell = (v: string) =>
    /^[=+\-@\t\r]/.test(v)
      ? `'${v}`
      : v.includes(",")
        ? `"${v.replaceAll('"', '""')}"`
        : v;
  return [
    "Email,Status,Source,Subscribed,Confirmed",
    ...rows.map((r) =>
      [
        cell(r.email),
        r.status,
        r.source,
        r.createdAt.toISOString().slice(0, 10),
        r.confirmedAt?.toISOString().slice(0, 10) ?? "",
      ].join(","),
    ),
  ].join("\r\n");
}
