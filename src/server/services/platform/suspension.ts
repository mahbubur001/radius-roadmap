import { eq } from "drizzle-orm";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  accountSettings,
  organization,
  updates,
  workspaces,
} from "@/server/db/schema";
import { NotFoundError } from "../context";
import { type AdminActor, audit } from "./audit";

// Suspending an account (doc 28 C8). Data is kept; the checks that stop the
// dashboard, public site, widget, API, webhooks and post emails call
// isSuspended(). Worker-safe.

export async function isSuspended(db: DbOrTx, accountId: string) {
  const [row] = await db
    .select({ at: accountSettings.suspendedAt })
    .from(accountSettings)
    .where(eq(accountSettings.accountId, accountId))
    .limit(1);
  return !!row?.at;
}

async function setSuspended(
  db: Db,
  admin: AdminActor,
  accountId: string,
  reason: string | null,
) {
  const [account] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, accountId))
    .limit(1);
  if (!account) throw new NotFoundError("Account not found.");
  const values = {
    suspendedAt: reason ? new Date() : null,
    suspendedReason: reason,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(accountSettings)
      .values({ accountId, ...values })
      .onConflictDoUpdate({ target: accountSettings.accountId, set: values });
    await audit(
      tx,
      admin,
      reason ? "account.suspended" : "account.unsuspended",
      accountId,
      reason ? { reason } : {},
    );
  });
}

export function suspendAccount(
  db: Db,
  admin: AdminActor,
  accountId: string,
  reason: string,
) {
  return setSuspended(db, admin, accountId, reason);
}

export function unsuspendAccount(db: Db, admin: AdminActor, accountId: string) {
  return setSuspended(db, admin, accountId, null);
}

/** Is the account that owns this workspace or post suspended? (worker emails) */
export async function ownerSuspended(
  db: DbOrTx,
  of: { workspaceId: string } | { updateId: string },
) {
  const [row] =
    "workspaceId" in of
      ? await db
          .select({ accountId: workspaces.accountId })
          .from(workspaces)
          .where(eq(workspaces.id, of.workspaceId))
          .limit(1)
      : await db
          .select({ accountId: updates.accountId })
          .from(updates)
          .where(eq(updates.id, of.updateId))
          .limit(1);
  return row ? isSuspended(db, row.accountId) : false;
}
