"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { turnstileToken } from "./turnstile";
import { publicApi, useVoter, type Voter } from "./voter-provider";

/** Voter sign-in: email code (verified) or guest (name + email). */
export function SignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { site, embed, setVoter } = useVoter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  function done(voter: Voter) {
    setVoter(voter);
    onOpenChange(false);
    setSent(false);
    setCode("");
    toast.success(`Signed in as ${voter.name || voter.email}.`);
  }

  async function sendCode() {
    setBusy(true);
    const res = await publicApi(
      "/api/public/auth/code",
      { site, embed },
      {
        method: "POST",
        body: { email, next: window.location.pathname },
      },
    );
    setBusy(false);
    if (!res.ok) return toast.error(res.data.error ?? "Couldn't send a code.");
    setSent(true);
  }

  async function verify() {
    setBusy(true);
    const res = await publicApi<{ voter: Voter }>(
      "/api/public/auth/verify",
      { site, embed },
      {
        method: "POST",
        body: { email, code },
      },
    );
    setBusy(false);
    if (!res.ok) return toast.error(res.data.error ?? "Wrong code.");
    done(res.data.voter);
  }

  async function guest() {
    setBusy(true);
    try {
      const res = await publicApi<{ voter: Voter }>(
        "/api/public/auth/guest",
        { site, embed },
        {
          method: "POST",
          body: { name, email, turnstileToken: await turnstileToken() },
        },
      );
      if (!res.ok) return toast.error(res.data.error ?? "Couldn't sign in.");
      done(res.data.voter);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-[22px] border-0 bg-sheet p-0 text-[15px] sm:max-w-[400px]">
        <DialogHeader className="gap-0 border-b-2 border-dashed border-rule2 px-[22px] pt-6 pb-5 text-left">
          <div className="font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase">
            No password needed
          </div>
          <DialogTitle className="mt-1.5 font-t-display text-[26px] font-bold tracking-[-0.02em]">
            Log in
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
            Your votes and ideas are saved to your name so the team can follow
            up.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          defaultValue="email"
          className="gap-0 px-[22px] pt-[18px] pb-[22px]"
        >
          <TabsList className="mb-3 h-auto w-full gap-2 bg-transparent p-0">
            <TabsTrigger value="email" className={TAB}>
              Email code
            </TabsTrigger>
            <TabsTrigger value="guest" className={TAB}>
              Guest
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email">
            {sent ? (
              <form
                className="flex flex-col gap-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify();
                }}
              >
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to <strong>{email}</strong>.
                </p>
                <label htmlFor="voter-code" className={LABEL}>
                  Code
                </label>
                <input
                  className={INPUT}
                  id="voter-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  type="submit"
                  className={SUBMIT}
                  disabled={busy || code.length !== 6}
                >
                  {busy ? "Checking…" : "Log in"}
                </button>
                <button
                  type="button"
                  className="font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase hover:text-foreground"
                  onClick={() => setSent(false)}
                >
                  Use a different email
                </button>
              </form>
            ) : (
              <form
                className="flex flex-col gap-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
              >
                <label htmlFor="voter-email" className={LABEL}>
                  Email
                </label>
                <input
                  className={INPUT}
                  id="voter-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button type="submit" className={SUBMIT} disabled={busy}>
                  {busy ? "Sending…" : "Email me a code"}
                </button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="guest">
            <form
              className="flex flex-col gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void guest();
              }}
            >
              <label htmlFor="guest-name" className={LABEL}>
                Name
              </label>
              <input
                className={INPUT}
                id="guest-name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="guest-email" className={LABEL}>
                Email
              </label>
              <input
                className={INPUT}
                id="guest-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className={SUBMIT} disabled={busy}>
                {busy ? "Signing in…" : "Continue as guest"}
              </button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const TAB =
  "h-[34px] flex-1 rounded-full text-[13.5px] font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--rule2)] data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background";
const LABEL =
  "-mb-2 font-t-mono text-[11px] font-bold tracking-[0.12em] text-ink3 uppercase";
const INPUT =
  "min-h-[46px] w-full rounded-xl bg-paper px-3.5 py-3 text-base outline-none placeholder:text-ink3 focus:bg-sheet focus:shadow-[inset_0_0_0_2px_var(--primary)]";
const SUBMIT =
  "h-[50px] rounded-[14px] bg-foreground font-t-display text-[15px] font-bold text-background disabled:opacity-60";
