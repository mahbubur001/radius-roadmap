"use client";

import {
  BookOpen,
  Globe,
  Home,
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

const items = [
  { href: "", label: "Home", icon: Home },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/roadmap", label: "Roadmap", icon: MapIcon },
  { href: "/updates", label: "Updates", icon: Megaphone },
  { href: "/articles", label: "Articles", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings, gap: true },
  { href: "/public-settings", label: "Public settings", icon: Globe },
];

export function SidebarNav() {
  const { workspace } = useParams<{ workspace: string }>();
  const pathname = usePathname();
  const base = `/dashboard/${workspace}`;

  return (
    <nav className="flex flex-col items-center gap-1">
      {items.map(({ href, label, icon: Icon, gap }) => {
        const to = `${base}${href}`;
        const active = href ? pathname.startsWith(to) : pathname === base;
        return (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Link
                href={to}
                aria-label={label}
                className={cn(
                  "flex size-10 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  gap && "mt-4",
                )}
              >
                <Icon className="size-5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
