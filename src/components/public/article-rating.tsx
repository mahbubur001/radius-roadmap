"use client";

import { useState } from "react";
import type { ArticleRating as Rating } from "@/lib/schemas/articles";
import { cn } from "@/lib/utils";
import { useVoter } from "./voter-provider";

const FACES: { value: Rating; emoji: string; label: string }[] = [
  { value: "dislike", emoji: "😞", label: "Not helpful" },
  { value: "neutral", emoji: "😐", label: "Somewhat helpful" },
  { value: "like", emoji: "😀", label: "Helpful" },
];

/** "Was this helpful?" under an article (doc 25 A4). No sign-in needed. */
export function ArticleRating({ articleId }: { articleId: string }) {
  const { ratings, rateArticle } = useVoter();
  const mine = ratings[articleId] ?? null;
  const [busy, setBusy] = useState(false);
  const [thanked, setThanked] = useState(false);
  return (
    <fieldset className="mt-6 flex flex-col items-center gap-3 border-t pt-6">
      <legend className="sr-only">Was this helpful?</legend>
      <p aria-hidden className="font-medium">
        Was this helpful?
      </p>
      <div className="flex gap-3">
        {FACES.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={mine === f.value}
            aria-label={f.label}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const next = mine === f.value ? null : f.value;
              const ok = await rateArticle(articleId, next);
              setBusy(false);
              setThanked(ok && !!next);
            }}
            className={cn(
              "flex size-12 items-center justify-center rounded-full border text-2xl transition-transform hover:scale-110",
              mine === f.value
                ? "border-primary bg-primary/10"
                : "bg-background",
              mine && mine !== f.value && "opacity-50",
            )}
          >
            <span aria-hidden>{f.emoji}</span>
          </button>
        ))}
      </div>
      <p className="h-5 text-sm text-muted-foreground" aria-live="polite">
        {thanked ? "Thanks for your feedback!" : ""}
      </p>
    </fieldset>
  );
}
