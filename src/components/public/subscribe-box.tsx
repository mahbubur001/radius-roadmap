"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <output className="flex items-center gap-3 rounded-lg border bg-card px-5 py-4 text-sm">
        <Mail className="size-5 text-primary" />
        {state === "active"
          ? "You're subscribed. New updates will arrive in your inbox."
          : "Check your inbox and confirm your email to start getting updates."}
      </output>
    );
  }

  return (
    <form
      aria-label="Get updates by email"
      className="flex flex-col gap-3 rounded-lg border bg-card px-5 py-4 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-1 items-center gap-3">
        <Mail className="size-5 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-medium">Get updates by email</p>
          <p className="text-muted-foreground">
            {oneClick
              ? `We'll send them to ${voter?.email}.`
              : "One email per update. Unsubscribe any time."}
          </p>
        </div>
      </div>
      {oneClick ? null : (
        <Input
          type="email"
          required
          aria-label="Email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sm:w-64"
        />
      )}
      <Button type="submit" disabled={busy}>
        Subscribe
      </Button>
      {state === "error" ? (
        <p className="text-sm text-destructive sm:basis-full">{error}</p>
      ) : null}
    </form>
  );
}
