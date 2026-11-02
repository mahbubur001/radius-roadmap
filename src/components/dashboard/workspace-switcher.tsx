"use client";

import { Check, ChevronDown, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { useSidebarCollapsed } from "./sidebar";

export type SwitcherWorkspace = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export function WorkspaceSwitcher({
  current,
  workspaces,
  canManage,
}: {
  current: string;
  workspaces: SwitcherWorkspace[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const collapsed = useSidebarCollapsed();
  const active = workspaces.find((w) => w.slug === current);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Switch workspace"
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg text-left text-sidebar-accent-foreground outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed ? "p-1" : "w-full px-1.5 py-1.5",
          )}
        >
          <WorkspaceAvatar workspace={active} />
          {collapsed ? null : (
            <>
              <span className="flex-1 truncate font-display text-[15px] font-semibold tracking-[-0.01em]">
                {active?.name}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-faint" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} asChild>
              <Link href={`/dashboard/${w.slug}`}>
                <WorkspaceAvatar workspace={w} />
                <span className="flex-1 truncate">{w.name}</span>
                {w.slug === current ? <Check /> : null}
              </Link>
            </DropdownMenuItem>
          ))}
          {canManage ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus />
                New workspace
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/${current}/settings/workspace`}>
                  <Settings />
                  Workspace settings
                </Link>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canManage ? (
        <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
      ) : null}
    </>
  );
}

function WorkspaceAvatar({
  workspace,
}: {
  workspace: SwitcherWorkspace | undefined;
}) {
  return (
    <Avatar className="size-6 rounded-md">
      {workspace?.logoUrl ? (
        <AvatarImage src={workspace.logoUrl} alt="" />
      ) : null}
      <AvatarFallback className="rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">
        {initials(workspace?.name ?? "?")}
      </AvatarFallback>
    </Avatar>
  );
}
