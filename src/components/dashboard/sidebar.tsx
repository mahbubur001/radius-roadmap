"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import { cn } from "@/lib/utils";
import { useStoredFlag } from "./use-stored-flag";

const SidebarContext = createContext(false);

/** True when the dashboard sidebar shows icons only. */
export function useSidebarCollapsed() {
  return useContext(SidebarContext);
}

/** Collapsible dashboard sidebar; the choice is remembered per browser. */
export function Sidebar({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useStoredFlag(
    "rr-sidebar-collapsed",
    false,
  );

  return (
    <SidebarContext.Provider value={collapsed}>
      <aside
        className={cn(
          "sticky top-0 z-20 flex h-svh shrink-0 flex-col gap-6 bg-sidebar py-4 text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-16 items-center" : "w-52 px-3",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="absolute top-6 -right-3 flex size-6 items-center justify-center rounded-full bg-sidebar-foreground text-sidebar-primary shadow-sm hover:opacity-90"
        >
          {collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronLeft className="size-3.5" />
          )}
        </button>
        {children}
      </aside>
    </SidebarContext.Provider>
  );
}
