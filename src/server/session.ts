import "server-only";
import { and, eq } from "drizzle-orm";
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

/** The signed-in user's active account. Redirects to onboarding if none. */
export const requireAccount = cache(async (): Promise<AccountContext> => {
  const session = await requireUser();
  const accountId = session.session.activeOrganizationId;
  if (!accountId) redirect("/onboarding");

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, accountId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!row) redirect("/onboarding");

  return { accountId, userId: session.user.id, role: toRole(row.role) };
});

export const requireWorkspace = cache(
  async (slug: string): Promise<WorkspaceContext> => {
    const ctx = await requireAccount();
    const ws = await getWorkspaceBySlug(db, ctx, slug).catch(() => null);
    if (!ws) redirect("/");
    return { ...ctx, workspaceId: ws.id, workspaceSlug: ws.slug };
  },
);
