import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
  type CreateApiKeyInput,
  createApiKeySchema,
} from "@/lib/schemas/api-keys";
import type { Db, DbOrTx } from "@/server/db/client";
import { apiKeys, member, user } from "@/server/db/schema";
import {
  type AccountContext,
  assertRole,
  ConflictError,
  NotFoundError,
  toRole,
} from "./context";
import { assertFeature, hasFeature } from "./plan-limits";
import { isSuspended } from "./platform/suspension";

// Public REST API keys (doc 27 A1–A3). Only hashes are stored.

const KEY_PREFIX = "rr_live_";
const MAX_KEYS = 10;

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** Create a key; the full key is returned once and never stored. */
export async function createApiKey(
  db: Db,
  ctx: AccountContext,
  input: CreateApiKeyInput,
) {
  assertRole(ctx, "admin");
  await assertFeature(db, ctx.accountId, "api");
  const data = createApiKeySchema.parse(input);
  const [active] = await db
    .select({ n: count() })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.accountId, ctx.accountId), isNull(apiKeys.revokedAt)),
    );
  if ((active?.n ?? 0) >= MAX_KEYS) {
    throw new ConflictError(`An account can have up to ${MAX_KEYS} keys.`);
  }
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      accountId: ctx.accountId,
      name: data.name,
      prefix: key.slice(0, KEY_PREFIX.length + 8),
      keyHash: hashApiKey(key),
      permission: data.permission,
      createdBy: ctx.userId,
    })
    .returning({ id: apiKeys.id });
  if (!row) throw new Error("Key not created.");
  return { id: row.id, key };
}

/** The account's keys that still work (owners and admins see all). */
export async function listApiKeys(db: Db, ctx: AccountContext) {
  assertRole(ctx, "admin");
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      permission: apiKeys.permission,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
      createdBy: user.name,
    })
    .from(apiKeys)
    .innerJoin(user, eq(user.id, apiKeys.createdBy))
    .where(and(eq(apiKeys.accountId, ctx.accountId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(db: Db, ctx: AccountContext, id: string) {
  assertRole(ctx, "admin");
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.accountId, ctx.accountId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  if (!row) throw new NotFoundError("Key not found.");
}

/** Revoke a person's keys when they leave the account (A3). */
export async function revokeKeysOf(
  db: DbOrTx,
  accountId: string,
  userId: string,
) {
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.accountId, accountId),
        eq(apiKeys.createdBy, userId),
        isNull(apiKeys.revokedAt),
      ),
    );
}

export type ApiCaller = {
  ctx: AccountContext;
  keyId: string;
  permission: "read" | "write";
};

/**
 * The account and permissions behind a key, or null. The key acts as its
 * creator, who must still be an owner or admin of the account (A3), and
 * the account's plan must include the API (A12).
 */
export async function verifyApiKey(
  db: Db,
  key: string,
  now = new Date(),
): Promise<ApiCaller | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length > 100) return null;
  const [row] = await db
    .select({
      id: apiKeys.id,
      accountId: apiKeys.accountId,
      permission: apiKeys.permission,
      userId: apiKeys.createdBy,
      role: member.role,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, apiKeys.accountId),
        eq(member.userId, apiKeys.createdBy),
        inArray(member.role, ["owner", "admin"]),
      ),
    )
    .where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (!(await hasFeature(db, row.accountId, "api"))) return null;
  if (await isSuspended(db, row.accountId)) return null; // doc 28 C8
  const minuteAgo = new Date(now.getTime() - 60_000);
  if (!row.lastUsedAt || row.lastUsedAt < minuteAgo) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiKeys.id, row.id),
          or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, minuteAgo)),
        ),
      );
  }
  return {
    keyId: row.id,
    permission: row.permission,
    ctx: {
      accountId: row.accountId,
      userId: row.userId,
      role: toRole(row.role),
    },
  };
}
