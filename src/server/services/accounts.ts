import { and, asc, eq } from "drizzle-orm";
import {
  type UpdateAccountInput,
  updateAccountSchema,
} from "@/lib/schemas/account";
import type { Db } from "@/server/db/client";
import { member, organization } from "@/server/db/schema";
import {
  type AccountContext,
  assertRole,
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  toRole,
} from "./context";

/** Accounts the user belongs to, oldest membership first. */
export async function listMyAccounts(db: Db, userId: string) {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
  return rows.map((r) => ({ ...r, role: toRole(r.role) }));
}

export async function getAccount(db: Db, ctx: AccountContext) {
  const [row] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, ctx.accountId))
    .limit(1);
  if (!row) throw new NotFoundError("Account not found.");
  return row;
}

export async function updateAccount(
  db: Db,
  ctx: AccountContext,
  input: UpdateAccountInput,
) {
  assertRole(ctx, "admin");
  const data = updateAccountSchema.parse(input);
  try {
    await db
      .update(organization)
      .set({ name: data.name, slug: data.slug })
      .where(eq(organization.id, ctx.accountId));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("That account URL is already used.");
    }
    throw error;
  }
}

/** Store (or clear) the account logo's storage key. */
export async function setAccountLogo(
  db: Db,
  ctx: AccountContext,
  logo: string | null,
) {
  assertRole(ctx, "admin");
  await db
    .update(organization)
    .set({ logo })
    .where(eq(organization.id, ctx.accountId));
}

/** True when `userId` is a member of `accountId`. */
export async function isMember(db: Db, accountId: string, userId: string) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, accountId), eq(member.userId, userId)))
    .limit(1);
  return Boolean(row);
}
