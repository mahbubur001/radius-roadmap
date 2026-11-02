import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { AdminNav, AdminSearch } from "./admin-nav";
import { AdminTheme } from "./admin-theme";

export const metadata: Metadata = {
  title: { default: "Operator", template: "%s · Operator · Radius Roadmap" },
  robots: { index: false, follow: false },
};

const MOBILE_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/accounts/new", label: "Invite" },
  { href: "/admin/activity", label: "Activity" },
];

/** Platform admin console (doc 28). Everyone else gets a 404 (proxy + gate). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<Skeleton className="m-8 h-96" />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  return (
    <div
      data-platform-admin=""
      className="flex h-svh bg-(--admin-ink) text-foreground"
    >
      <AdminTheme />
      <AdminNav email={admin.email} />
      <div className="flex min-w-0 flex-1 flex-col py-2 pr-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-background shadow-sheet">
          <header className="flex h-12 shrink-0 items-center gap-4 border-b px-4 md:px-6">
            <span className="font-display font-semibold md:hidden">
              Operator
            </span>
            <AdminSearch />
            <span className="ml-auto hidden items-center gap-2 font-mono text-[11px] text-faint md:flex">
              <span className="size-1.5 rounded-full bg-(--admin-pro)" />
              operator console
            </span>
          </header>
          <nav
            aria-label="Admin"
            className="flex gap-1 overflow-x-auto border-b px-4 py-2 text-sm md:hidden"
          >
            {MOBILE_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <main className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
