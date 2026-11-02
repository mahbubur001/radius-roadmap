"use client";

import { PanelLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStoredFlag } from "./use-stored-flag";

const KEY = "rr-sidebar-collapsed";

/** True when the dashboard sidebar shows icons only (remembered per browser). */
export function useSidebarCollapsed() {
  return useStoredFlag(KEY, false)[0];
}

/**
 * The dimmed sidebar on the canvas (doc 30): it steps back so the sheet with
 * the work leads. Collapses to icons with the toggle in the top bar.
 */
export function Sidebar({ children }: { children: ReactNode }) {
  const collapsed = useSidebarCollapsed();
  return (
    <aside
      className={cn(
        "sticky top-0 flex h-svh shrink-0 flex-col gap-0.5 py-2 text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-14 items-center px-2" : "w-60 pr-3 pl-1",
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useStoredFlag(KEY, false);
  return (
    <button
      type="button"
      onClick={() => setCollapsed(!collapsed)}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      className="-ml-1.5 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <PanelLeft className="size-4" />
    </button>
  );
}
