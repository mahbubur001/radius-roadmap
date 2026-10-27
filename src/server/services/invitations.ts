import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { type InviteInput, inviteSchema } from "@/lib/schemas/team";
import type { Db } from "@/server/db/client";
import {
  invitation,
  member,
  organization,
  user,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema";
import type { EmailJob } from "@/server/email/types";
import {
  type AccountContext,
  assertRole,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  toRole,
} from "./context";
import { getPlanLimits } from "./plan-limits";

// Invitations are written here (with our role rules) and accepted through
// Better Auth's accept endpoint, whose afterAcceptInvitation hook calls
// grantInvitedWorkspaces below.

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function listInvitations(db: Db, ctx: AccountContext) {
  const rows = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, ctx.accountId),
        eq(invitation.status, "pending"),
      ),
    )
    .orderBy(desc(invitation.createdAt));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: toRole(r.role ?? "member"),
    workspaceIds: r.workspaceIds ?? [],
    expiresAt: r.expiresAt,
    expired: r.expiresAt < new Date(),
  }));
}

export type PendingInvitation = Awaited<
  ReturnType<typeof listInvitations>
>[number];

async function accountWorkspaceIds(
  db: Db,
  accountId: string,
  ids: readonly string[],
) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.accountId, accountId),
        inArray(workspaces.id, [...ids]),
      ),
    );
  return rows.map((r) => r.id);
}

export async function invite(db: Db, ctx: AccountContext, input: InviteInput) {
  assertRole(ctx, "admin");
  const data = inviteSchema.parse(input);
  if (data.role === "owner") assertRole(ctx, "owner");

  const [existingMember] = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(eq(member.organizationId, ctx.accountId), eq(user.email, data.email)),
    )
    .limit(1);
  if (existingMember) throw new ConflictError("They're already on the team.");

  const pending = await listInvitations(db, ctx);
  if (pending.some((i) => i.email === data.email)) {
    throw new ConflictError(
      "They're already invited. Resend the invitation instead.",
    );
  }

  const limits = await getPlanLimits(db, ctx.accountId);
  const [members] = await db
    .select({ n: count() })
    .from(member)
    .where(eq(member.organizationId, ctx.accountId));
  if ((members?.n ?? 0) + pending.length >= limits.teammates) {
    throw new ForbiddenError("Your plan doesn't allow more teammates.");
  }

  const workspaceIds =
    data.role === "member"
      ? await accountWorkspaceIds(db, ctx.accountId, data.workspaceIds)
      : [];

  const [row] = await db
    .insert(invitation)
    .values({
      id: randomUUID(),
      organizationId: ctx.accountId,
      email: data.email,
      role: data.role,
      status: "pending",
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      inviterId: ctx.userId,
      workspaceIds,
    })
    .returning();
  if (!row) throw new Error("Failed to create invitation.");
  return row;
}

async function getPending(db: Db, ctx: AccountContext, invitationId: string) {
  const [row] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, ctx.accountId),
        eq(invitation.id, invitationId),
        eq(invitation.status, "pending"),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Invitation not found.");
  if (row.role === "owner") assertRole(ctx, "owner");
  return row;
}

/** Extends the expiry; the caller re-sends the email. */
export async function renewInvitation(
  db: Db,
  ctx: AccountContext,
  invitationId: string,
) {
  assertRole(ctx, "admin");
  await getPending(db, ctx, invitationId);
  const [row] = await db
    .update(invitation)
    .set({ expiresAt: new Date(Date.now() + INVITATION_TTL_MS) })
    .where(eq(invitation.id, invitationId))
    .returning();
  if (!row) throw new NotFoundError("Invitation not found.");
  return row;
}

export async function cancelInvitation(
  db: Db,
  ctx: AccountContext,
  invitationId: string,
) {
  assertRole(ctx, "admin");
  await getPending(db, ctx, invitationId);
  await db
    .update(invitation)
    .set({ status: "canceled" })
    .where(eq(invitation.id, invitationId));
}

/** The invitation email job for `invitationId` (enqueued by the caller). */
export async function invitationEmail(
  db: Db,
  ctx: AccountContext,
  invitationId: string,
  appUrl: string,
): Promise<EmailJob> {
  const [row] = await db
    .select({
      email: invitation.email,
      role: invitation.role,
      workspaceIds: invitation.workspaceIds,
      accountName: organization.name,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.organizationId, ctx.accountId),
        eq(invitation.id, invitationId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Invitation not found.");

  const ids = row.workspaceIds ?? [];
  const names = ids.length
    ? (
        await db
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(
            and(
              eq(workspaces.accountId, ctx.accountId),
              inArray(workspaces.id, ids),
            ),
          )
      ).map((w) => w.name)
    : [];

  return {
    template: "invitation",
    to: row.email,
    props: {
      inviterName: row.inviterName,
      accountName: row.accountName,
      role: toRole(row.role ?? "member"),
      workspaceNames: names,
      url: `${appUrl}/accept-invite/${invitationId}`,
    },
  };
}

/**
 * Called from Better Auth's afterAcceptInvitation hook: grant the invited
 * workspaces. Ids are re-checked against the inviting account, so ids from
 * another account (e.g. sent straight to the API) are ignored.
 */
export async function grantInvitedWorkspaces(
  db: Db,
  inv: { organizationId: string; role: string | null; workspaceIds?: unknown },
  userId: string,
) {
  if (toRole(inv.role ?? "member") !== "member") return;
  const requested = Array.isArray(inv.workspaceIds)
    ? inv.workspaceIds.filter((id): id is string => typeof id === "string")
    : [];
  const ids = await accountWorkspaceIds(db, inv.organizationId, requested);
  if (!ids.length) return;
  await db
    .insert(workspaceMembers)
    .values(
      ids.map((workspaceId) => ({
        accountId: inv.organizationId,
        workspaceId,
        userId,
      })),
    )
    .onConflictDoNothing();
}

/**
 * What the accept page shows before sign-in. Keyed only by the invitation id
 * (a random UUID that only the invitee's email contains), so it reveals just
 * the account name, inviter and invited email.
 */
export async function getInvitationPreview(db: Db, invitationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) return null;
  const [row] = await db
    .select({
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      accountName: organization.name,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.inviterId))
    .where(eq(invitation.id, invitationId))
    .limit(1);
  if (!row) return null;
  return {
    email: row.email,
    accountName: row.accountName,
    inviterName: row.inviterName,
    usable: row.status === "pending" && row.expiresAt > new Date(),
  };
}

export type InvitationPreview = NonNullable<
  Awaited<ReturnType<typeof getInvitationPreview>>
>;
