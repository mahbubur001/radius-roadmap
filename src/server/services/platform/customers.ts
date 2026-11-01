import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { PLANS } from "@/lib/plans";
import {
  type InviteCustomerInput,
  inviteCustomerSchema,
} from "@/lib/schemas/platform";
import type { Db } from "@/server/db/client";
import { invitation, member, organization } from "@/server/db/schema";
import type { EmailJob } from "@/server/email/types";
import { ConflictError, isUniqueViolation, NotFoundError } from "../context";
import { createWorkspace } from "../workspaces";
import { type AdminActor, audit } from "./audit";
import { endOfDay, setOverride } from "./overrides";

// A platform admin sets up an account for a new customer (doc 28 C3): the
// account, its first workspace (seeded as usual), optionally a plan, and an
// owner invitation the customer accepts at /accept-invite.

const CUSTOMER_INVITE_TTL_MS = 14 * 24 * 3600 * 1000;

function inviteEmail(
  to: string,
  invitationId: string,
  accountName: string,
  appUrl: string,
  plan: { name: string; endsAt: Date | null } | null,
): EmailJob {
  return {
    template: "customer-invite",
    to,
    props: {
      accountName,
      planName: plan?.name ?? null,
      endsAt: plan?.endsAt?.toISOString() ?? null,
      url: `${appUrl}/accept-invite/${invitationId}`,
    },
  };
}

export async function inviteCustomer(
  db: Db,
  admin: AdminActor,
  input: InviteCustomerInput,
  appUrl: string,
) {
  const data = inviteCustomerSchema.parse(input);
  const accountId = `acct_${randomUUID().replace(/-/g, "")}`;
  try {
    await db.insert(organization).values({
      id: accountId,
      name: data.accountName,
      slug: data.accountSlug,
      createdAt: new Date(),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("That account URL is already used.");
    }
    throw error;
  }

  try {
    // The admin acts as the owner just to create and seed the workspace.
    await createWorkspace(
      db,
      { accountId, userId: admin.userId, role: "owner" },
      { name: data.workspaceName, slug: data.workspaceSlug },
    );
    if (data.plan) {
      await setOverride(db, admin, {
        accountId,
        plan: data.plan,
        endsOn: data.endsOn,
        note: data.note,
      });
    }
    const invitationId = randomUUID();
    await db.insert(invitation).values({
      id: invitationId,
      organizationId: accountId,
      email: data.ownerEmail,
      role: "owner",
      status: "pending",
      expiresAt: new Date(Date.now() + CUSTOMER_INVITE_TTL_MS),
      inviterId: admin.userId,
      workspaceIds: [],
    });
    await audit(db, admin, "customer.invited", accountId, {
      ownerEmail: data.ownerEmail,
      plan: data.plan || null,
      endsOn: data.endsOn || null,
    });
    return {
      accountId,
      email: inviteEmail(
        data.ownerEmail,
        invitationId,
        data.accountName,
        appUrl,
        data.plan
          ? {
              name: PLANS[data.plan].name,
              endsAt: data.endsOn ? endOfDay(data.endsOn) : null,
            }
          : null,
      ),
    };
  } catch (error) {
    // Nothing half-made is left behind (everything cascades from the account).
    await db.delete(organization).where(eq(organization.id, accountId));
    throw error;
  }
}

async function pendingOwnerInvite(db: Db, accountId: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      accountName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        eq(invitation.organizationId, accountId),
        eq(invitation.status, "pending"),
        eq(invitation.role, "owner"),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("No pending owner invitation.");
  return row;
}

/** Another 14 days, and the email again. */
export async function resendCustomerInvite(
  db: Db,
  admin: AdminActor,
  accountId: string,
  appUrl: string,
) {
  const row = await pendingOwnerInvite(db, accountId);
  await db
    .update(invitation)
    .set({ expiresAt: new Date(Date.now() + CUSTOMER_INVITE_TTL_MS) })
    .where(eq(invitation.id, row.id));
  await audit(db, admin, "customer.invite_resent", accountId, {
    ownerEmail: row.email,
  });
  return inviteEmail(row.email, row.id, row.accountName, appUrl, null);
}

/**
 * Withdraw the owner invitation. If nobody has joined the account yet, the
 * account (made only for this invitation) is deleted too. Returns whether it
 * was.
 */
export async function cancelCustomerInvite(
  db: Db,
  admin: AdminActor,
  accountId: string,
) {
  const row = await pendingOwnerInvite(db, accountId);
  const [members] = await db
    .select({ n: count() })
    .from(member)
    .where(eq(member.organizationId, accountId));
  const empty = (members?.n ?? 0) === 0;
  await audit(db, admin, "customer.invite_cancelled", accountId, {
    ownerEmail: row.email,
    accountDeleted: empty,
  });
  if (empty) {
    await db.delete(organization).where(eq(organization.id, accountId));
  } else {
    await db.delete(invitation).where(eq(invitation.id, row.id));
  }
  return { accountDeleted: empty };
}
