import { Suspense } from "react";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { getWorkspaceBySlug } from "@/server/services/workspaces";
import { requireUser, requireWorkspace } from "@/server/session";

// The shell renders immediately; only the auth gate and the parts that read
// the session wait for the request (Cache Components pattern).
export default function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/[workspace]">) {
  const slug = params.then((p) => p.workspace);

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 flex h-svh w-16 flex-col items-center gap-6 border-r bg-sidebar py-4">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          R
        </div>
        <Suspense fallback={null}>
          <SidebarNav />
        </Suspense>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <Suspense fallback={<Skeleton className="h-5 w-40" />}>
            <WorkspaceName slug={slug} />
          </Suspense>
          <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
            <CurrentUser />
          </Suspense>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

async function WorkspaceName({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const ws = await getWorkspaceBySlug(db, ctx, ctx.workspaceSlug);
  return <h1 className="text-sm font-semibold">{ws.name}</h1>;
}

async function CurrentUser() {
  const { user } = await requireUser();
  return <UserMenu name={user.name} email={user.email} />;
}
