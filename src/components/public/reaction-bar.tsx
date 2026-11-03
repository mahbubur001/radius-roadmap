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
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3 font-t-mono text-[13px] font-semibold transition-colors",
              mine
                ? "bg-tint shadow-[inset_0_0_0_1.5px_var(--primary)]"
                : "shadow-[inset_0_0_0_1px_var(--rule2)] hover:bg-sheet",
            )}
          >
            <span aria-hidden>{r.emoji}</span>
            {total ? <span>{total}</span> : null}
          </button>
        );
      })}
    </fieldset>
  );
}
