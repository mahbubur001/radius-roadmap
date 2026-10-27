import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { trackedUsers, voterLoginCodes } from "@/server/db/schema";
import { ConflictError, ForbiddenError, type PublicContext } from "./context";
import { identifyTrackedUser } from "./tracked-users";

// Voter sign-in on public sites (doc 19 §3.8, D2): guest (name + email,
// unverified) and magic link (6-digit code or one-time link, verified).
// Codes and tokens are stored only as SHA-256 hashes.

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function codeHash(ctx: PublicContext, email: string, code: string) {
  return sha256(`${ctx.accountId}:${email}:${code}`);
}

function sameHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Guest sign-in. An email that was already verified by a code can't be
 * claimed as a guest (that would let anyone act as that voter).
 */
export async function guestSignIn(
  db: Db,
  ctx: PublicContext,
  input: { name: string; email: string },
) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ verifiedAt: trackedUsers.emailVerifiedAt })
    .from(trackedUsers)
    .where(
      and(
        eq(trackedUsers.accountId, ctx.accountId),
        eq(trackedUsers.email, email),
      ),
    )
    .limit(1);
  if (existing?.verifiedAt) {
    throw new ConflictError(
      "This email is verified. Sign in with an email code instead.",
    );
  }
  return identifyTrackedUser(db, ctx, {
    kind: "guest",
    name: input.name,
    email,
  });
}

/** Creates a code + link token for `email`; earlier codes stop working. */
export async function startEmailCode(
  db: Db,
  ctx: PublicContext,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .update(voterLoginCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(voterLoginCodes.accountId, ctx.accountId),
          eq(voterLoginCodes.email, normalized),
          isNull(voterLoginCodes.consumedAt),
        ),
      );
    await tx.insert(voterLoginCodes).values({
      accountId: ctx.accountId,
      email: normalized,
      codeHash: codeHash(ctx, normalized, code),
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
  });
  return { code, token };
}

const INVALID = "That code is wrong or has expired. Request a new one.";

async function signInVerified(db: Db, ctx: PublicContext, email: string) {
  return identifyTrackedUser(db, ctx, { kind: "email", email, verified: true });
}

export async function verifyEmailCode(
  db: Db,
  ctx: PublicContext,
  email: string,
  code: string,
) {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(voterLoginCodes)
    .where(
      and(
        eq(voterLoginCodes.accountId, ctx.accountId),
        eq(voterLoginCodes.email, normalized),
        isNull(voterLoginCodes.consumedAt),
        gt(voterLoginCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(voterLoginCodes.createdAt))
    .limit(1);
  if (!row || row.attempts >= MAX_CODE_ATTEMPTS)
    throw new ForbiddenError(INVALID);

  if (!sameHash(row.codeHash, codeHash(ctx, normalized, code))) {
    const attempts = row.attempts + 1;
    await db
      .update(voterLoginCodes)
      .set({
        attempts,
        // The fifth wrong try burns the code.
        ...(attempts >= MAX_CODE_ATTEMPTS ? { consumedAt: new Date() } : {}),
      })
      .where(eq(voterLoginCodes.id, row.id));
    throw new ForbiddenError(INVALID);
  }

  // Consume atomically so the same code can't sign in twice.
  const [consumed] = await db
    .update(voterLoginCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(voterLoginCodes.id, row.id), isNull(voterLoginCodes.consumedAt)),
    )
    .returning({ id: voterLoginCodes.id });
  if (!consumed) throw new ForbiddenError(INVALID);
  return signInVerified(db, ctx, normalized);
}

export async function verifyEmailLink(
  db: Db,
  ctx: PublicContext,
  token: string,
) {
  const [row] = await db
    .update(voterLoginCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(voterLoginCodes.accountId, ctx.accountId),
        eq(voterLoginCodes.tokenHash, sha256(token)),
        isNull(voterLoginCodes.consumedAt),
        gt(voterLoginCodes.expiresAt, new Date()),
      ),
    )
    .returning({ email: voterLoginCodes.email });
  if (!row) throw new ForbiddenError("This sign-in link has expired.");
  return signInVerified(db, ctx, row.email);
}
