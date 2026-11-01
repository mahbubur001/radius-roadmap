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
    <div data-platform-admin="" className="flex min-h-svh bg-(--admin-canvas)">
      <AdminTheme />
      <AdminNav email={admin.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-(--admin-canvas)/85 px-4 backdrop-blur md:px-8">
          <span className="font-semibold md:hidden">Operator</span>
          <AdminSearch />
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
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
