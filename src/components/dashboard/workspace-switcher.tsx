"use client";

import { Check, Plus, Settings } from "lucide-react";
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
import { CreateWorkspaceDialog } from "./create-workspace-dialog";

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
  const active = workspaces.find((w) => w.slug === current);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Switch workspace"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <WorkspaceAvatar workspace={active} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} asChild>
              <Link href={`/${w.slug}`}>
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
                <Link href={`/${current}/settings/workspace`}>
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
    <Avatar className={small ? "size-6 rounded-md" : "size-9 rounded-md"}>
      {workspace?.logoUrl ? (
        <AvatarImage src={workspace.logoUrl} alt="" />
      ) : null}
      <AvatarFallback className="rounded-md bg-primary text-xs font-semibold text-primary-foreground">
        {initials(workspace?.name ?? "?")}
      </AvatarFallback>
    </Avatar>
  );
}
