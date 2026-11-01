import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePlatformAdmin } from "@/server/platform-admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Radius Roadmap" },
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/accounts/new", label: "Invite a customer" },
  { href: "/admin/activity", label: "Activity" },
];

/** Platform admin panel (doc 28). Everyone else gets a 404 from the gate. */
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
    <div className="flex min-h-svh flex-col" data-platform-admin="">
      <header className="border-b bg-muted/40">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <span className="whitespace-nowrap font-semibold">
            Radius Roadmap admin
          </span>
          <nav aria-label="Admin" className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-muted-foreground">
            {admin.email} ·{" "}
            <Link href="/" className="underline">
              Back to the app
            </Link>
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
