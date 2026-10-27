import { and, asc, count, eq, ne } from "drizzle-orm";
import type { Db, DbOrTx } from "@/server/db/client";
import { member, user, workspaceMembers } from "@/server/db/schema";
import {
  type AccountContext,
  assertRole,
  ForbiddenError,
  NotFoundError,
  type Role,
  toRole,
} from "./context";
import { listWorkspaceAccess, setWorkspaceAccess } from "./workspaces";

// Team rules (doc 18 §4.3):
// - owners and admins manage the team; only an owner can touch owners
// - an account always keeps at least one owner
// Member rows are Better Auth's `member` table; its HTTP endpoints for these
// writes are disabled (see src/server/auth) so these rules can't be skipped.

export async function listMembers(db: Db, ctx: AccountContext) {
  const rows = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.accountId))
    .orderBy(asc(member.createdAt));

  const access = await listWorkspaceAccess(db, ctx);
  return rows.map((r) => ({
    ...r,
    role: toRole(r.role),
    workspaceIds: access
      .filter((a) => a.userId === r.userId)
      .map((a) => a.workspaceId),
  }));
}

export type TeamMember = Awaited<ReturnType<typeof listMembers>>[number];

async function getMember(db: Db, ctx: AccountContext, memberId: string) {
  const [row] = await db
    .select()
    .from(member)
    .where(
      and(eq(member.organizationId, ctx.accountId), eq(member.id, memberId)),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Member not found.");
  return { ...row, role: toRole(row.role) };
}

async function otherOwnerCount(db: Db, ctx: AccountContext, memberId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(member)
    .where(
      and(
        eq(member.organizationId, ctx.accountId),
        eq(member.role, "owner"),
        ne(member.id, memberId),
      ),
    );
  return row?.n ?? 0;
}

async function dropWorkspaceAccess(
  db: DbOrTx,
  ctx: AccountContext,
  userId: string,
) {
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.accountId, ctx.accountId),
        eq(workspaceMembers.userId, userId),
      ),
    );
}

export async function changeRole(
  db: Db,
  ctx: AccountContext,
  memberId: string,
  role: Role,
) {
  assertRole(ctx, "admin");
  const target = await getMember(db, ctx, memberId);
  if (target.role === role) return;
  if (target.role === "owner" || role === "owner") assertRole(ctx, "owner");
  if (
    target.role === "owner" &&
    (await otherOwnerCount(db, ctx, memberId)) === 0
  ) {
    throw new ForbiddenError("An account needs at least one owner.");
  }
  await db.transaction(async (tx) => {
    await tx.update(member).set({ role }).where(eq(member.id, memberId));
    // Owners and admins see every workspace; grants only matter for members.
    if (role !== "member") await dropWorkspaceAccess(tx, ctx, target.userId);
  });
}

export async function setMemberWorkspaces(
  db: Db,
  ctx: AccountContext,
  memberId: string,
  workspaceIds: readonly string[],
) {
  assertRole(ctx, "admin");
  const target = await getMember(db, ctx, memberId);
  if (target.role !== "member") {
    throw new ForbiddenError("Owners and admins already see every workspace.");
  }
  await setWorkspaceAccess(db, ctx, target.userId, workspaceIds);
}

export async function removeMember(
  db: Db,
  ctx: AccountContext,
  memberId: string,
) {
  assertRole(ctx, "admin");
  const target = await getMember(db, ctx, memberId);
  if (target.userId === ctx.userId) {
    throw new ForbiddenError("Use “Leave account” to remove yourself.");
  }
  if (target.role === "owner") assertRole(ctx, "owner");
  await db.transaction(async (tx) => {
    await dropWorkspaceAccess(tx, ctx, target.userId);
    await tx.delete(member).where(eq(member.id, memberId));
  });
}

export async function leaveAccount(db: Db, ctx: AccountContext) {
  const [self] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, ctx.accountId),
        eq(member.userId, ctx.userId),
      ),
    )
    .limit(1);
  if (!self) throw new NotFoundError("Member not found.");
  if (
    self.role === "owner" &&
    (await otherOwnerCount(db, ctx, self.id)) === 0
  ) {
    throw new ForbiddenError(
      "You're the only owner. Make someone else an owner before leaving.",
    );
  }
  await db.transaction(async (tx) => {
    await dropWorkspaceAccess(tx, ctx, ctx.userId);
    await tx.delete(member).where(eq(member.id, self.id));
  });
}

/** The caller (an owner) hands ownership to `memberId` and becomes an admin. */
export async function transferOwnership(
  db: Db,
  ctx: AccountContext,
  memberId: string,
) {
  assertRole(ctx, "owner");
  const target = await getMember(db, ctx, memberId);
  if (target.userId === ctx.userId) return;
  await db.transaction(async (tx) => {
    await tx
      .update(member)
      .set({ role: "owner" })
      .where(eq(member.id, memberId));
    await dropWorkspaceAccess(tx, ctx, target.userId);
    await tx
      .update(member)
      .set({ role: "admin" })
      .where(
        and(
          eq(member.organizationId, ctx.accountId),
          eq(member.userId, ctx.userId),
        ),
      );
  });
}
