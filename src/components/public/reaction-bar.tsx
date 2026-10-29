"use client";

import { REACTIONS, type ReactionCounts } from "@/lib/reactions";
import { cn } from "@/lib/utils";
import { useVoter } from "./voter-provider";

/** 👍 ❤️ 🎉 👀 under a post (doc 23 U4). No sign-in needed. */
export function ReactionBar({
  postId,
  counts,
  className,
}: {
  postId: string;
  counts: ReactionCounts;
  className?: string;
}) {
  const { reactions, reactionTotals, toggleReaction } = useVoter();
  return (
    <fieldset
      aria-label="Reactions"
      className={cn("relative z-10 flex flex-wrap gap-2", className)}
    >
      {REACTIONS.map((r) => {
        const key = `${postId}:${r.key}`;
        const mine = reactions.has(key);
        const total = reactionTotals[key] ?? counts[r.key] ?? 0;
        return (
          <button
            key={r.key}
            type="button"
            aria-pressed={mine}
            aria-label={`${r.label} (${total})`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void toggleReaction(postId, r.key);
            }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
              mine
                ? "border-primary bg-primary/10"
                : "bg-background hover:bg-muted",
            )}
          >
            <span aria-hidden>{r.emoji}</span>
            {total ? <span className="tabular-nums">{total}</span> : null}
          </button>
        );
      })}
    </fieldset>
  );
}
