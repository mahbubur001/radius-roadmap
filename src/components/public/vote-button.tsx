"use client";

import { ArrowUp, ChevronUp } from "lucide-react";
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
  /** The card's or idea's id. `big`: full-width phone button (doc 31). */
  cardId: string;
  votes: number | null;
  variant?: "inline" | "pill" | "plain" | "big" | "box" | "car";
  kind?: VoteKind;
}) {
  const { voted, totals, toggleVote } = useVoter();
  const active = voted.has(cardId);
  const total = totals[cardId] ?? votes;

  // The Transit carriage card's vote box (doc 32): big mono number, a
  // chevron above it; brand-filled once voted.
  if (variant === "car") {
    return (
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
          "flex h-[58px] w-full flex-col items-center justify-center rounded-xl font-t-mono text-lg leading-[normal] font-bold tracking-[-0.03em] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:h-[62px] md:text-xl",
          active ? "bg-primary text-white" : "bg-paper",
        )}
      >
        <ChevronUp
          strokeWidth={1.8}
          className={cn("mb-px size-3.5", active ? "text-white" : "text-ink3")}
        />
        {total !== null ? <span data-testid="vote-count">{total}</span> : null}
      </button>
    );
  }

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
        variant === "big"
          ? cn(
              "h-12 w-full justify-center gap-2 rounded-xl text-[15px] font-semibold",
              active
                ? "bg-primary/10 text-primary ring-1 ring-primary"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )
          : variant === "box"
            ? cn(
                "h-13 w-12 flex-col justify-center gap-0 rounded-xl border text-sm font-bold",
                active && "border-primary bg-primary/10",
              )
            : variant === "pill"
              ? "h-9 border px-3 text-sm"
              : variant === "plain"
                ? "-ml-2 h-9 gap-2 px-2 text-sm text-foreground hover:bg-primary/10"
                : "-ml-1.5 h-7 px-1.5 text-sm",
        variant !== "plain" &&
          variant !== "big" &&
          (active
            ? "text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"),
        active && variant === "pill" && "border-primary bg-primary/10",
        active && variant === "plain" && "bg-primary/10 text-primary",
      )}
    >
      <ArrowUp
        className={cn(
          variant === "plain"
            ? "size-5 text-primary"
            : variant === "big"
              ? "size-5"
              : "size-4",
          active && "stroke-[2.5]",
        )}
      />
      {variant === "big" ? <span>{active ? "Voted" : "Vote"}</span> : null}
      {variant === "big" && total !== null ? <span aria-hidden>·</span> : null}
      {total !== null ? <span data-testid="vote-count">{total}</span> : null}
    </button>
  );
  // Small counts on cards and lists get a "Votes" tooltip (LoopedIn).
  return variant === "inline" ? <Hint label="Votes">{button}</Hint> : button;
}
