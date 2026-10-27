import "server-only";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { member } from "@/server/db/schema";
import {
  type AccountContext,
  toRole,
  type WorkspaceContext,
} from "@/server/services/context";
import { getWorkspaceBySlug } from "@/server/services/workspaces";

// Request-scoped helpers. With Cache Components these read runtime data, so
// call them only from components rendered inside <Suspense> (see CLAUDE.md).

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/**
 * The signed-in user's account: the session's active one if they're still a
 * member, otherwise their oldest membership (e.g. just accepted an invite).
 * Redirects to onboarding when they belong to no account.
 */
export const requireAccount = cache(async (): Promise<AccountContext> => {
  const session = await requireUser();
  const active = session.session.activeOrganizationId;

  const rows = await db
    .select({ accountId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .orderBy(asc(member.createdAt));
  const row = rows.find((r) => r.accountId === active) ?? rows[0];
  if (!row) redirect("/onboarding");

  return {
    accountId: row.accountId,
    userId: session.user.id,
    role: toRole(row.role),
  };
});

export const requireWorkspace = cache(
  async (slug: string): Promise<WorkspaceContext> => {
    const ctx = await requireAccount();
    const ws = await getWorkspaceBySlug(db, ctx, slug).catch(() => null);
    if (!ws) redirect("/");
    return { ...ctx, workspaceId: ws.id, workspaceSlug: ws.slug };
  },
);
