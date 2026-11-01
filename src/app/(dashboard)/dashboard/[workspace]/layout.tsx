import Link from "next/link";
import { Suspense } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { listMyAccounts } from "@/server/services/accounts";
import { getBillingRow } from "@/server/services/billing";
import { seesAllWorkspaces } from "@/server/services/context";
import { inboxCount } from "@/server/services/feedback";
import { billing } from "@/server/services/plan-limits";
import {
  getWorkspaceBySlug,
  listWorkspaces,
} from "@/server/services/workspaces";
import { requireUser, requireWorkspace } from "@/server/session";
import { fileUrl } from "@/server/storage";

// The shell renders immediately; only the auth gate and the parts that read
// the session wait for the request (Cache Components pattern).
export default function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/dashboard/[workspace]">) {
  const slug = params.then((p) => p.workspace);

  return (
    <div className="flex min-h-svh">
      <Sidebar>
        <Suspense fallback={<Skeleton className="size-9 rounded-md" />}>
          <Switcher slug={slug} />
        </Suspense>
        <Suspense fallback={null}>
          <Nav slug={slug} />
        </Suspense>
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <Suspense fallback={<Skeleton className="h-5 w-40" />}>
            <WorkspaceName slug={slug} />
          </Suspense>
          <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
            <CurrentUser slug={slug} />
          </Suspense>
        </header>
        <Suspense fallback={null}>
          <PastDueBanner slug={slug} />
        </Suspense>
        <main className="flex-1 bg-muted/40 p-6">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

async function Switcher({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const workspaces = await listWorkspaces(db, ctx);
  return (
    <WorkspaceSwitcher
      current={ctx.workspaceSlug}
      canManage={seesAllWorkspaces(ctx)}
      workspaces={workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        logoUrl: fileUrl(w.logo),
      }))}
    />
  );
}

async function Nav({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  return <SidebarNav inbox={await inboxCount(db, ctx)} />;
}

async function WorkspaceName({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const ws = await getWorkspaceBySlug(db, ctx, ctx.workspaceSlug);
  return <h1 className="text-sm font-semibold">{ws.name}</h1>;
}

async function CurrentUser({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const { user } = await requireUser();
  const accounts = await listMyAccounts(db, user.id);
  return (
    <UserMenu
      name={user.name}
      email={user.email}
      imageUrl={fileUrl(user.image ?? null)}
      profileHref={`/dashboard/${ctx.workspaceSlug}/settings/profile`}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      currentAccountId={ctx.accountId}
    />
  );
}

/** Owners and admins see it while Stripe retries a failed payment. */
async function PastDueBanner({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx) || !billing.enabled()) return null;
  const row = await getBillingRow(db, ctx.accountId);
  if (row?.status !== "past_due") return null;
  return (
    <div className="border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-sm">
      Your last payment didn&apos;t go through.{" "}
      <Link
        href={`/dashboard/${ctx.workspaceSlug}/settings/billing`}
        className="font-medium underline"
      >
        Update your payment details
      </Link>{" "}
      to keep your plan.
    </div>
  );
}
