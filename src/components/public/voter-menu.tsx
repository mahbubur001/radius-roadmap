"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVoter } from "./voter-provider";

export function VoterMenu() {
  const { voter, openSignIn, signOut } = useVoter();
  if (!voter) {
    return (
      <button
        type="button"
        onClick={openSignIn}
        className="h-9 shrink-0 rounded-full px-3.5 font-medium ring-1 ring-rule2 ring-inset hover:bg-sheet"
      >
        Sign in
      </button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-9 max-w-40 shrink-0 truncate rounded-full px-3.5 font-medium ring-1 ring-rule2 ring-inset hover:bg-sheet"
        >
          {voter.name || voter.email}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {voter.email}
          {voter.verified ? "" : " (guest)"}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void signOut()}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
