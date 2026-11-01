"use client";

import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "./hint";
import { useVoter, type VoteKind } from "./voter-provider";

/**
 * Upvote toggle (↑ everywhere, doc 22 P5). `votes` is null when the roadmap
 * hides counts. `inline` sits in a card's footer; `pill` is the bordered
 * box in the ideas list; `plain` (accent icon, no border) heads the card and
 * idea drawers and pages.
 */
export function VoteButton({
  cardId,
  votes,
  variant = "inline",
  kind = "card",
}: {
  /** The card's or idea's id. */
  cardId: string;
  votes: number | null;
  variant?: "inline" | "pill" | "plain";
  kind?: VoteKind;
}) {
  const { voted, totals, toggleVote } = useVoter();
  const active = voted.has(cardId);
  const total = totals[cardId] ?? votes;

  const button = (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Remove your vote" : "Vote for this"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleVote(cardId, kind);
      }}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        variant === "pill"
          ? "h-9 border px-3 text-sm"
          : variant === "plain"
            ? "-ml-2 h-9 gap-2 px-2 text-sm text-foreground hover:bg-primary/10"
            : "-ml-1.5 h-7 px-1.5 text-sm",
        variant !== "plain" &&
          (active
            ? "text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"),
        active && variant === "pill" && "border-primary bg-primary/10",
        active && variant === "plain" && "bg-primary/10 text-primary",
      )}
    >
      <ArrowUp
        className={cn(
          variant === "plain" ? "size-5 text-primary" : "size-4",
          active && "stroke-[2.5]",
        )}
      />
      {total !== null ? <span data-testid="vote-count">{total}</span> : null}
    </button>
  );
  // Small counts on cards and lists get a "Votes" tooltip (LoopedIn).
  return variant === "inline" ? <Hint label="Votes">{button}</Hint> : button;
}
