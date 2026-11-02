"use client";

import {
  Building2,
  History,
  LayoutDashboard,
  Search,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Operator console navigation (doc 28), grouped by what staff come to do.

const GROUPS = [
  {
    label: "Monitor",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/admin/activity", label: "Activity", icon: History },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/admin/accounts", label: "Accounts", icon: Building2 },
      {
        href: "/admin/accounts/new",
        label: "Invite a customer",
        icon: UserPlus,
        exact: true,
      },
    ],
  },
];

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) =>
    exact
      ? pathname === href
      : pathname === href ||
        (pathname.startsWith(`${href}/`) && pathname !== "/admin/accounts/new");

  return (
    <aside className="hidden h-svh w-60 shrink-0 flex-col text-(--admin-ink-text) md:flex">
      <div className="flex h-14 items-center gap-3 px-5">
        <span className="grid size-8 place-items-center rounded-[9px] bg-foreground font-display text-sm font-semibold text-background">
          R
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-semibold text-sm text-white">
            Radius Roadmap
          </span>
          <span className="w-fit rounded bg-(--admin-pro)/10 px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-(--admin-pro)">
            Operator
          </span>
        </span>
      </div>
      <nav aria-label="Admin" className="flex flex-1 flex-col gap-5 px-3 py-4">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-(--admin-ink-text)/60">
              {g.label}
            </p>
            {g.items.map(({ href, label, icon: Icon, exact }) => {
              const on = active(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    on
                      ? "bg-(--admin-ink-soft) font-medium text-white"
                      : "hover:bg-(--admin-ink-soft)/60 hover:text-white",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4",
                      on
                        ? "text-primary"
                        : "opacity-70 group-hover:opacity-100",
                    )}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-2 p-4 text-xs">
        <span className="truncate text-white/90" title={email}>
          {email}
        </span>
        <Link
          href="/"
          className="w-fit underline-offset-4 hover:text-white hover:underline"
        >
          Back to the app
        </Link>
      </div>
    </aside>
  );
}

/** Jump to accounts by name, URL or email, from any admin page. */
export function AdminSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <search className="w-full max-w-md">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(
            `/admin/accounts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`,
          );
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find an account by name, URL or email"
          aria-label="Find an account"
          className="h-8 w-full rounded-lg bg-muted pr-3 pl-9 text-sm outline-none transition-shadow placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </form>
    </search>
  );
}
