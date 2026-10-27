"use client";

import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoter } from "./voter-provider";

/** Upvote toggle. `votes` is null when the roadmap hides counts. */
export function VoteButton({
  cardId,
  votes,
  size = "sm",
}: {
  cardId: string;
  votes: number | null;
  size?: "sm" | "lg";
}) {
  const { voted, totals, toggleVote } = useVoter();
  const active = voted.has(cardId);
  const total = totals[cardId] ?? votes;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Remove your vote" : "Vote for this"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleVote(cardId);
      }}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-md border font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        size === "lg" ? "h-14 w-14 text-sm" : "h-11 w-11 text-xs",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:border-primary hover:text-primary",
      )}
    >
      <ChevronUp className={size === "lg" ? "size-5" : "size-4"} />
      {total !== null ? <span data-testid="vote-count">{total}</span> : null}
    </button>
  );
}
