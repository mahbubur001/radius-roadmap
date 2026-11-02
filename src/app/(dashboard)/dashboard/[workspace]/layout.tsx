import Link from "next/link";
import { Suspense } from "react";
import {
  CommandButton,
  CommandMenu,
} from "@/components/dashboard/command-menu";
import { PlanFeaturesProvider } from "@/components/dashboard/plan-features";
import { PublicSiteLink } from "@/components/dashboard/public-site-link";
import { Sidebar } from "@/components/dashboard/sidebar";
import { PlanNote, ThemeButton } from "@/components/dashboard/sidebar-footer";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { TopBar } from "@/components/dashboard/top-bar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { WorkspaceRail } from "@/components/dashboard/workspace-rail";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { publicSiteUrl } from "@/server/public-url";
import { getAccount, listMyAccounts } from "@/server/services/accounts";
import { getBillingRow } from "@/server/services/billing";
import { seesAllWorkspaces } from "@/server/services/context";
import { activeHostname } from "@/server/services/custom-domains";
import { inboxCount } from "@/server/services/feedback";
import {
  billing,
  getAccountPlan,
  hasFeature,
} from "@/server/services/plan-limits";
import { getDefaultWorkspace } from "@/server/services/public-site";
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

  // Rail (workspaces, you) · dimmed sidebar · the inset sheet (doc 30).
  return (
    <div data-dashboard="" className="flex h-svh bg-canvas">
      <div className="sticky top-0 flex h-svh w-13 shrink-0 flex-col items-center gap-2 py-3">
        <span
          aria-hidden
          className="mb-1 grid size-8 place-items-center rounded-[9px] bg-foreground text-background"
        >
          <BrandMark />
        </span>
        <Suspense fallback={null}>
          <Rail slug={slug} />
        </Suspense>
        <div className="flex-1" />
        <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
          <CurrentUser slug={slug} />
        </Suspense>
      </div>
      <Sidebar>
        <Suspense fallback={<Skeleton className="h-8 w-full" />}>
          <Switcher slug={slug} />
        </Suspense>
        <Suspense fallback={<div className="h-6" />}>
          <PublicLink slug={slug} />
        </Suspense>
        <CommandButton />
        <Suspense fallback={null}>
          <Nav slug={slug} />
        </Suspense>
        <div className="flex-1" />
        <Suspense fallback={null}>
          <Plan slug={slug} />
        </Suspense>
        <ThemeButton />
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col py-2 pr-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-background shadow-sheet">
          <Suspense fallback={<div className="h-12 border-b" />}>
            <Bar slug={slug} />
          </Suspense>
          <Suspense fallback={null}>
            <PastDueBanner slug={slug} />
          </Suspense>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1500px] p-6">
              <Suspense fallback={null}>
                <Features slug={slug}>{children}</Features>
              </Suspense>
            </div>
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <CommandMenu />
      </Suspense>
    </div>
  );
}

/** The Radius mark: two arcs and a dot (signal). */
function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <path d="M4 18a14 14 0 0 1 14-14" strokeWidth="2.4" />
      <path d="M8 18a10 10 0 0 1 10-10" strokeWidth="2.4" opacity=".6" />
      <circle cx="17" cy="17" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** What the plan includes, for the "Pro" walls in the UI (doc 29 T8). */
async function Features({
  slug,
  children,
}: {
  slug: Promise<string>;
  children: React.ReactNode;
}) {
  const ctx = await requireWorkspace(await slug);
  const uploads = await hasFeature(db, ctx.accountId, "uploads");
  return (
    <PlanFeaturesProvider
      value={{
        uploads,
        billingHref: billing.enabled()
          ? `/dashboard/${ctx.workspaceSlug}/settings/billing`
          : null,
      }}
    >
      {children}
    </PlanFeaturesProvider>
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

async function Rail({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const workspaces = await listWorkspaces(db, ctx);
  return (
    <WorkspaceRail
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

/** The workspace's public address under its name, opening the live site. */
async function PublicLink({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const [account, defaultWorkspace, customHost] = await Promise.all([
    getAccount(db, ctx),
    getDefaultWorkspace(db, ctx.accountId),
    activeHostname(db, ctx.accountId),
  ]);
  const url = publicSiteUrl(
    account.slug,
    ctx.workspaceSlug,
    defaultWorkspace,
    customHost,
  );
  return <PublicSiteLink url={url} />;
}

async function Plan({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return null;
  const pro = (await getAccountPlan(db, ctx.accountId)) === "pro";
  return (
    <PlanNote
      pro={pro}
      billingHref={
        billing.enabled()
          ? `/dashboard/${ctx.workspaceSlug}/settings/billing`
          : null
      }
    />
  );
}

async function Bar({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const ws = await getWorkspaceBySlug(db, ctx, ctx.workspaceSlug);
  return <TopBar workspaceName={ws.name} />;
}

async function Nav({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  return <SidebarNav inbox={await inboxCount(db, ctx)} />;
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
    <div className="border-b border-destructive/30 bg-destructive/8 px-6 py-2 text-sm">
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
