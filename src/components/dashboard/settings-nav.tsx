"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "profile", label: "Profile" },
  { href: "workspace", label: "Workspace" },
  { href: "account", label: "Account" },
  { href: "team", label: "Team" },
];

export function SettingsNav() {
  const { workspace } = useParams<{ workspace: string }>();
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 md:flex-col" aria-label="Settings">
      {items.map(({ href, label }) => {
        const to = `/dashboard/${workspace}/settings/${href}`;
        return (
          <Link
            key={href}
            href={to}
            className={cn(
              "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              pathname.startsWith(to) && "bg-muted font-medium text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
