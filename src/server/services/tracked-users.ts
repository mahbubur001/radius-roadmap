import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import {
  type TrackedUserKind,
  trackedUserSessions,
  trackedUsers,
} from "@/server/db/schema";
import {
  isUniqueViolation,
  NotFoundError,
  type PublicContext,
} from "./context";

// Voters / end users of an account's public pages and widget (doc 18 §3.5).
// Phase 2 builds the sign-in flows (guest, magic link, social, SSO, widget
// identify) on top of these functions.

export const VOTER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type IdentifyInput = {
  kind: TrackedUserKind;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
  /** True when the email was proven (magic link, social, SSO). */
  verified?: boolean;
};

async function findExisting(db: Db, ctx: PublicContext, input: IdentifyInput) {
  const email = input.email?.trim().toLowerCase() || null;
  if (input.externalId) {
    const [byId] = await db
      .select()
      .from(trackedUsers)
      .where(
        and(
          eq(trackedUsers.accountId, ctx.accountId),
          eq(trackedUsers.externalId, input.externalId),
        ),
      )
      .limit(1);
    if (byId) return byId;
  }
  if (!email) return undefined;
  const [byEmail] = await db
    .select()
    .from(trackedUsers)
    .where(
      and(
        eq(trackedUsers.accountId, ctx.accountId),
        eq(trackedUsers.email, email),
      ),
    )
    .limit(1);
  return byEmail;
}

/**
 * Finds the voter by external id or email in this account, or creates one.
 * An unverified (guest) identity never overwrites a verified one's details.
 */
export async function identifyTrackedUser(
  db: Db,
  ctx: PublicContext,
  input: IdentifyInput,
  retry = true,
) {
  const email = input.email?.trim().toLowerCase() || null;
  const existing = await findExisting(db, ctx, input);
  const now = new Date();

  if (existing) {
    const protectedRow = existing.emailVerifiedAt !== null && !input.verified;
    const [row] = await db
      .update(trackedUsers)
      .set({
        lastSeenAt: now,
        ...(protectedRow
          ? {}
          : {
              kind: input.kind,
              name: input.name ?? existing.name,
              avatarUrl: input.avatarUrl ?? existing.avatarUrl,
              email: existing.email ?? email,
            }),
        ...(input.verified
          ? { emailVerifiedAt: existing.emailVerifiedAt ?? now }
          : {}),
        externalId: existing.externalId ?? input.externalId ?? null,
        metadata: { ...existing.metadata, ...input.metadata },
      })
      .where(eq(trackedUsers.id, existing.id))
      .returning();
    if (!row) throw new NotFoundError("Voter not found.");
    return row;
  }

  try {
    const [row] = await db
      .insert(trackedUsers)
      .values({
        accountId: ctx.accountId,
        kind: input.kind,
        email,
        emailVerifiedAt: input.verified ? now : null,
        name: input.name ?? null,
        avatarUrl: input.avatarUrl ?? null,
        externalId: input.externalId ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!row) throw new Error("Failed to create voter.");
    return row;
  } catch (error) {
    // Two requests identified the same person at once: use the winner's row.
    if (retry && isUniqueViolation(error)) {
      return identifyTrackedUser(db, ctx, input, false);
    }
    throw error;
  }
}

export async function getTrackedUser(db: Db, ctx: PublicContext, id: string) {
  const [row] = await db
    .select()
    .from(trackedUsers)
    .where(
      and(eq(trackedUsers.accountId, ctx.accountId), eq(trackedUsers.id, id)),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Voter not found.");
  return row;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Starts a voter session; the raw token goes in a cookie and is never stored. */
export async function createTrackedSession(
  db: Db,
  ctx: PublicContext,
  trackedUserId: string,
) {
  await getTrackedUser(db, ctx, trackedUserId);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + VOTER_SESSION_TTL_MS);
  await db.insert(trackedUserSessions).values({
    accountId: ctx.accountId,
    trackedUserId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

/** The voter behind a session cookie, if it's valid for this account. */
export async function getTrackedSession(
  db: Db,
  ctx: PublicContext,
  token: string,
) {
  if (!token) return null;
  const [row] = await db
    .select({ user: trackedUsers })
    .from(trackedUserSessions)
    .innerJoin(
      trackedUsers,
      eq(trackedUsers.id, trackedUserSessions.trackedUserId),
    )
    .where(
      and(
        eq(trackedUserSessions.tokenHash, hashToken(token)),
        eq(trackedUserSessions.accountId, ctx.accountId),
        gt(trackedUserSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.user ?? null;
}

export async function revokeTrackedSession(
  db: Db,
  ctx: PublicContext,
  token: string,
) {
  await db
    .delete(trackedUserSessions)
    .where(
      and(
        eq(trackedUserSessions.tokenHash, hashToken(token)),
        eq(trackedUserSessions.accountId, ctx.accountId),
      ),
    );
}
