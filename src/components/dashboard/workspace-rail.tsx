"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import type { SwitcherWorkspace } from "./workspace-switcher";

/** One mark per workspace the user can open, far left (doc 30 R7). */
export function WorkspaceRail({
  current,
  workspaces,
  canManage,
}: {
  current: string;
  workspaces: SwitcherWorkspace[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <nav
      aria-label="Workspaces"
      className="flex min-h-0 flex-col items-center gap-1.5 overflow-y-auto py-1"
    >
      {workspaces.map((w) => {
        const active = w.slug === current;
        return (
          <Tooltip key={w.id}>
            <TooltipTrigger asChild>
              <Link
                href={`/dashboard/${w.slug}`}
                aria-label={`Open ${w.name}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative grid size-8 shrink-0 place-items-center rounded-lg font-display text-[11.5px] font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active &&
                    "bg-background text-foreground shadow-sheet before:absolute before:top-2 before:bottom-2 before:-left-2.5 before:w-[3px] before:rounded-r before:bg-foreground hover:bg-background",
                )}
              >
                <Avatar className="size-full rounded-lg">
                  {w.logoUrl ? <AvatarImage src={w.logoUrl} alt="" /> : null}
                  <AvatarFallback className="rounded-lg bg-transparent">
                    {initials(w.name)}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{w.name}</TooltipContent>
          </Tooltip>
        );
      })}
      {canManage ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setCreating(true)}
                aria-label="Create a workspace"
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-dashed border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">New workspace</TooltipContent>
          </Tooltip>
          <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
        </>
      ) : null}
    </nav>
  );
}
