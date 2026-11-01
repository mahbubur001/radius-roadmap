import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { adminAuditLog, organization } from "@/server/db/schema";

// Append-only log of platform admin actions (doc 28 C9). Worker-safe.

export type AdminActor = { userId: string; email: string };

export type AuditAction =
  | "customer.invited"
  | "customer.invite_resent"
  | "customer.invite_cancelled"
  | "plan_override.set"
  | "plan_override.ended"
  | "account.suspended"
  | "account.unsuspended";

export async function audit(
  db: DbOrTx,
  admin: AdminActor,
  action: AuditAction,
  accountId: string | null,
  details: Record<string, unknown> = {},
) {
  await db.insert(adminAuditLog).values({
    adminEmail: admin.email,
    action,
    accountId,
    details,
  });
}

/** Newest first; `before` = createdAt of the last row seen. */
export async function listAudit(
  db: DbOrTx,
  opts: { accountId?: string; before?: Date; limit?: number } = {},
) {
  const where: SQL[] = [];
  if (opts.accountId) where.push(eq(adminAuditLog.accountId, opts.accountId));
  if (opts.before) where.push(lt(adminAuditLog.createdAt, opts.before));
  return db
    .select({
      id: adminAuditLog.id,
      adminEmail: adminAuditLog.adminEmail,
      action: adminAuditLog.action,
      accountId: adminAuditLog.accountId,
      accountName: organization.name,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .leftJoin(organization, eq(organization.id, adminAuditLog.accountId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(opts.limit ?? 50);
}
