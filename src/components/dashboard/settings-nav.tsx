"use client";

import {
  Bell,
  Building2,
  CreditCard,
  KeyRound,
  Link2,
  type LucideIcon,
  Palette,
  Settings,
  UserRound,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

const groups = (billing: boolean): { title: string; items: Item[] }[] => [
  {
    title: "Workspace",
    items: [
      { href: "workspace", label: "Workspace", icon: Settings },
      { href: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "account", label: "Account", icon: Building2 },
      { href: "branding", label: "Branding", icon: Palette },
      { href: "domain", label: "Domain", icon: Link2 },
      { href: "team", label: "Team", icon: Users },
      ...(billing
        ? [{ href: "billing", label: "Billing", icon: CreditCard }]
        : []),
    ],
  },
  {
    title: "Developers",
    items: [
      { href: "api", label: "API", icon: KeyRound },
      { href: "webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
  {
    title: "You",
    items: [{ href: "profile", label: "Profile", icon: UserRound }],
  },
];

/** Settings sections, grouped by what they apply to (doc 30). */
export function SettingsNav({ billing }: { billing: boolean }) {
  const { workspace } = useParams<{ workspace: string }>();
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible"
      aria-label="Settings"
    >
      {groups(billing).map((g) => (
        <div key={g.title} className="flex gap-1 md:flex-col md:gap-0.5">
          <p className="hidden px-2 pt-4 pb-1 font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase first:pt-0 md:block">
            {g.title}
          </p>
          {g.items.map(({ href, label, icon: Icon }) => {
            const to = `/dashboard/${workspace}/settings/${href}`;
            const active = pathname.startsWith(to);
            return (
              <Link
                key={href}
                href={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] text-muted-foreground hover:bg-accent hover:text-foreground",
                  active && "bg-accent font-medium text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
