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
            "flex min-w-0 items-center gap-2 rounded-md text-left text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            !collapsed && "w-full p-1 hover:bg-sidebar-accent/60",
          )}
        >
          <WorkspaceAvatar workspace={active} />
          {collapsed ? null : (
            <>
              <span className="flex-1 truncate text-sm font-semibold">
                {active?.name}
              </span>
              <ChevronDown className="size-4 shrink-0" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} asChild>
              <Link href={`/dashboard/${w.slug}`}>
                <WorkspaceAvatar workspace={w} small />
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
  small,
}: {
  workspace: SwitcherWorkspace | undefined;
  small?: boolean;
}) {
  return (
    <Avatar className={small ? "size-6 rounded-md" : "size-9 rounded-full"}>
      {workspace?.logoUrl ? (
        <AvatarImage src={workspace.logoUrl} alt="" />
      ) : null}
      <AvatarFallback
        className={cn(
          "text-xs font-semibold",
          small
            ? "rounded-md bg-primary text-primary-foreground"
            : "rounded-full bg-sidebar-foreground text-sidebar",
        )}
      >
        {initials(workspace?.name ?? "?")}
      </AvatarFallback>
    </Avatar>
  );
}
