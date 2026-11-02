"use client";

import {
  BookOpen,
  Globe,
  Home,
  Inbox,
  type LucideIcon,
  Map as MapIcon,
  Megaphone,
  PanelRight,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "./sidebar";

type Item = { href: string; label: string; icon: LucideIcon };

const main: Item[] = [
  { href: "", label: "Home", icon: Home },
  { href: "/feedback", label: "Feedback", icon: Inbox },
  { href: "/roadmap", label: "Roadmap", icon: MapIcon },
  { href: "/updates", label: "Updates", icon: Megaphone },
  { href: "/articles", label: "Articles", icon: BookOpen },
];

const configure: Item[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/public-settings", label: "Public settings", icon: Globe },
  { href: "/widget", label: "Widget", icon: PanelRight },
];

/** `inbox`: feedback waiting for review, shown as a count on Feedback. */
export function SidebarNav({ inbox = 0 }: { inbox?: number }) {
  const collapsed = useSidebarCollapsed();

  return (
    <nav
      aria-label="Workspace"
      className={cn(
        "flex w-full flex-col gap-0.5",
        collapsed && "items-center",
      )}
    >
      {main.map((item) => (
        <NavItem key={item.label} item={item} inbox={inbox} />
      ))}
      {collapsed ? (
        <div className="mt-4" />
      ) : (
        <p className="px-2 pt-5 pb-1.5 font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase">
          Configure
        </p>
      )}
      {configure.map((item) => (
        <NavItem key={item.label} item={item} inbox={inbox} />
      ))}
    </nav>
  );
}

function NavItem({
  item: { href, label, icon: Icon },
  inbox,
}: {
  item: Item;
  inbox: number;
}) {
  const collapsed = useSidebarCollapsed();
  const { workspace } = useParams<{ workspace: string }>();
  const pathname = usePathname();
  const base = `/dashboard/${workspace}`;
  const to = `${base}${href}`;
  const active = href ? pathname.startsWith(to) : pathname === base;
  const badge = href === "/feedback" && inbox ? inbox : 0;
  const description = badge ? `${label}, ${badge} waiting for review` : label;

  const link = (
    <Link
      href={to}
      aria-label={description}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg text-[13.5px] transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
        collapsed ? "size-9 justify-center" : "w-full px-2 py-1.5",
        active &&
          "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {collapsed ? null : <span className="truncate">{label}</span>}
      {badge ? (
        <span
          data-testid="inbox-badge"
          className={cn(
            "font-mono text-[11px] font-medium text-signal tabular-nums",
            collapsed
              ? "absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 text-[9.5px] text-white"
              : "ml-auto",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {badge ? `${label} · ${badge} waiting for review` : label}
      </TooltipContent>
    </Tooltip>
  );
}
