"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { turnstileToken } from "./turnstile";
import { publicApi, useVoter } from "./voter-provider";

/** "Get updates by email" (doc 23 U1): double opt-in, one click for voters. */
export function SubscribeBox({ justConfirmed }: { justConfirmed: boolean }) {
  const { site, embed, workspaceId, voter } = useVoter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "active" | "error">(
    justConfirmed ? "active" : "idle",
  );
  const [error, setError] = useState("");
  const oneClick = !!voter?.verified;

  async function submit() {
    if (!oneClick && !email.trim()) return;
    setBusy(true);
    const res = await publicApi<{ status: "pending" | "active" }>(
      "/api/public/subscribe",
      { site, embed },
      {
        method: "POST",
        body: {
          workspaceId,
          email: oneClick ? undefined : email.trim(),
          turnstileToken: oneClick ? undefined : await turnstileToken(),
        },
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.data.error ?? "Couldn't subscribe. Try again.");
      setState("error");
      return;
    }
    setState(res.data.status);
  }

  if (state === "active" || state === "pending") {
    return (
      <output className="mb-10 flex max-w-[460px] items-center gap-3 rounded-full bg-sheet py-3 pr-5 pl-[18px] text-sm ring-1 ring-border">
        <Mail strokeWidth={1.8} className="size-4 shrink-0 text-primary" />
        {state === "active"
          ? "You're subscribed. New updates will arrive in your inbox."
          : "Check your inbox and confirm your email to start getting updates."}
      </output>
    );
  }

  return (
    <div className="mb-10 max-w-[460px]">
      <form
        aria-label="Get updates by email"
        className="flex items-center gap-2.5 rounded-full bg-sheet py-2 pr-2 pl-[18px] ring-1 ring-border focus-within:ring-2 focus-within:ring-ring"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {oneClick ? (
          <span className="min-w-0 flex-1 truncate text-ink3">
            {voter?.email}
          </span>
        ) : (
          <input
            type="email"
            required
            aria-label="Email"
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink3"
          />
        )}
        <button
          type="submit"
          disabled={busy}
          aria-label="Subscribe"
          className="h-9 shrink-0 rounded-full bg-foreground px-4 font-semibold text-background disabled:opacity-60"
        >
          Get updates
        </button>
      </form>
      {state === "error" ? (
        <p className="mt-2 pl-[18px] text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
