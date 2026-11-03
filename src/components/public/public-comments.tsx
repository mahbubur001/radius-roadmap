"use client";

import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Linkified } from "@/components/linkified";
import { agoShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { turnstileToken } from "./turnstile";
import { publicApi, useVoter } from "./voter-provider";

type PublicComment = {
  id: string;
  body: string;
  author: string;
  team: boolean;
  createdAt: string;
  edited: boolean;
};

type Target = { feedbackId: string } | { cardId: string };

/**
 * Public comments on a card or idea (doc 20 D3), loaded on open (never
 * cached with the page). The ticket (doc 32) shows the thread in its body
 * and pins the reply box at the bottom, so the state lives in this hook.
 */
export function useComments(target: Target) {
  const { site, embed, voter, openSignIn } = useVoter();
  const [items, setItems] = useState<PublicComment[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(false);
  const query =
    "feedbackId" in target
      ? `feedbackId=${target.feedbackId}`
      : `cardId=${target.cardId}`;

  useEffect(() => {
    let live = true;
    publicApi<{ comments: PublicComment[] }>(`/api/public/comments?${query}`, {
      site,
      embed,
    }).then((res) => {
      if (live) setItems(res.ok ? res.data.comments : []);
    });
    return () => {
      live = false;
    };
  }, [query, site, embed]);

  async function post() {
    const sent = body;
    if (!sent.trim() || busy) return;
    if (!voter) return openSignIn();
    setBusy(true);
    const res = await publicApi<{ comment: PublicComment; pending: boolean }>(
      "/api/public/comments",
      { site, embed },
      {
        method: "POST",
        body: {
          ...target,
          body: sent,
          turnstileToken: voter.verified ? undefined : await turnstileToken(),
        },
      },
    );
    setBusy(false);
    if (res.status === 401) return openSignIn();
    if (!res.ok) {
      toast.error(res.data.error ?? "Couldn't post your comment.");
      return;
    }
    setBody((current) => (current === sent ? "" : current));
    if (res.data.pending) setHeld(true);
    else setItems((all) => [...(all ?? []), res.data.comment]);
  }

  return {
    items,
    held,
    body,
    setBody,
    busy,
    post,
    signedIn: !!voter,
    openSignIn,
  };
}

export type Comments = ReturnType<typeof useComments>;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** The conversation: avatar, name, TEAM badge, time, text. */
export function CommentThread({ comments }: { comments: Comments }) {
  const { items, held } = comments;
  return (
    <div>
      {items === null ? (
        <p className="mt-4 text-sm text-ink3">Loading comments…</p>
      ) : items.length ? (
        <ul aria-label="Comments">
          {items.map((c) => (
            <li key={c.id} className="mt-4 flex gap-3">
              <span
                aria-hidden
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full font-t-mono text-[11px] font-semibold",
                  c.team ? "bg-primary text-white" : "bg-paper",
                )}
              >
                {initials(c.author)}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">
                  {c.author}
                  {c.team ? (
                    <span className="ml-1.5 rounded px-[5px] py-0.5 font-t-mono text-[9.5px] font-bold tracking-[0.1em] text-white uppercase [background:var(--primary)]">
                      Team
                    </span>
                  ) : null}
                  <span
                    className="ml-2 font-t-mono text-[11.5px] font-medium text-ink3"
                    suppressHydrationWarning
                  >
                    {agoShort(new Date(c.createdAt))}
                    {c.edited ? " · edited" : ""}
                  </span>
                </div>
                <p className="mt-0.5 text-[14.5px] break-words whitespace-pre-wrap">
                  <Linkified text={c.body} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink3">
          No comments yet. Start the conversation.
        </p>
      )}
      {held ? (
        <p className="mt-4 rounded-xl bg-paper px-3.5 py-3 text-sm">
          Thanks! Your comment will show once the team approves it.
        </p>
      ) : null}
    </div>
  );
}

/** The reply box: a pill input and a round send button. */
export function CommentCompose({
  comments,
  className,
}: {
  comments: Comments;
  className?: string;
}) {
  const { body, setBody, busy, post, signedIn, openSignIn } = comments;
  return (
    <form
      className={cn("flex gap-2.5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void post();
      }}
    >
      {signedIn ? (
        <input
          aria-label="Write a comment"
          placeholder="Add to the conversation…"
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-full bg-paper px-4 outline-none placeholder:text-ink3 focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={openSignIn}
          aria-label="Log in to comment"
          className="flex h-11 min-w-0 flex-1 items-center rounded-full bg-paper px-4 text-left text-ink3"
        >
          Add to the conversation…
        </button>
      )}
      <button
        type={signedIn ? "submit" : "button"}
        aria-label="Post comment"
        disabled={signedIn && (busy || !body.trim())}
        onClick={signedIn ? undefined : openSignIn}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:opacity-50"
      >
        <Send strokeWidth={1.8} className="size-4" />
      </button>
    </form>
  );
}

/** Thread and reply box together, for places without a pinned footer. */
export function PublicComments({ target }: { target: Target }) {
  const comments = useComments(target);
  return (
    <div className="flex flex-col gap-4">
      <CommentThread comments={comments} />
      <CommentCompose comments={comments} />
    </div>
  );
}
