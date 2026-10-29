"use client";

import {
  BookOpen,
  Globe,
  Home,
  type LucideIcon,
  Map as MapIcon,
  Megaphone,
  MessageSquare,
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
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/roadmap", label: "Roadmap", icon: MapIcon },
  { href: "/updates", label: "Updates", icon: Megaphone },
  { href: "/articles", label: "Articles", icon: BookOpen },
];

const settings: Item[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/public-settings", label: "Public settings", icon: Globe },
];

/** `inbox`: feedback waiting for review, shown as a badge on Feedback. */
export function SidebarNav({ inbox = 0 }: { inbox?: number }) {
  const collapsed = useSidebarCollapsed();

  return (
    <nav
      className={cn("flex w-full flex-col gap-1", collapsed && "items-center")}
    >
      {main.map((item) => (
        <NavItem key={item.label} item={item} inbox={inbox} />
      ))}
      {collapsed ? (
        <div className="mt-4" />
      ) : (
        <p className="mt-3 mb-1 px-1 text-[11px] font-semibold tracking-wider text-sidebar-foreground/70 uppercase">
          Settings
        </p>
      )}
      {settings.map((item) => (
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
        "group flex items-center gap-3 rounded-md text-sm font-medium text-sidebar-foreground/75 hover:text-sidebar-foreground",
        collapsed ? "p-0" : "p-1 hover:bg-sidebar-accent/60",
        active && "text-sidebar-foreground",
        active && !collapsed && "bg-sidebar-accent",
      )}
    >
      <span
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-foreground/10 group-hover:bg-sidebar-foreground/20",
          active && "bg-sidebar-primary group-hover:bg-sidebar-primary",
        )}
      >
        <Icon className="size-[18px]" />
        {badge ? (
          <span
            data-testid="inbox-badge"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-foreground px-1 text-[10px] font-semibold text-sidebar"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      {collapsed ? null : <span className="truncate">{label}</span>}
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
