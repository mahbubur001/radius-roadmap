"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Linkified } from "@/components/linkified";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ago } from "@/lib/time";
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

/**
 * Comments tab on the public card and idea views (doc 20 D3). Loaded on open
 * (not cached with the page); logged-in visitors can add one.
 */
export function PublicComments({
  target,
}: {
  target: { feedbackId: string } | { cardId: string };
}) {
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

  return (
    <div className="flex flex-col gap-4">
      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : items.length ? (
        <ul className="flex flex-col gap-3" aria-label="Comments">
          {items.map((c) => (
            <li key={c.id} className="rounded-md border p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author}</span>
                {c.team ? <Badge variant="secondary">Team</Badge> : null}
                <span suppressHydrationWarning>
                  {ago(new Date(c.createdAt))}
                </span>
                {c.edited ? <span>(edited)</span> : null}
              </div>
              <p className="break-words whitespace-pre-wrap">
                <Linkified text={c.body} />
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}

      {held ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          Thanks! Your comment will show once the team approves it.
        </p>
      ) : null}

      {voter ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <Textarea
            aria-label="Write a comment"
            placeholder="Write a comment…"
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button
            type="submit"
            className="self-end"
            disabled={busy || !body.trim()}
          >
            Post comment
          </Button>
        </form>
      ) : (
        <Button variant="outline" className="self-start" onClick={openSignIn}>
          Log in to comment
        </Button>
      )}
    </div>
  );
}
