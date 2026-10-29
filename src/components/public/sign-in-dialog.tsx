"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log in</DialogTitle>
          <DialogDescription>
            No password needed. Your votes and ideas are saved to your name so
            the team can follow up.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="email">
          <TabsList className="w-full">
            <TabsTrigger value="email">Email code</TabsTrigger>
            <TabsTrigger value="guest">Guest</TabsTrigger>
          </TabsList>

          <TabsContent value="email">
            {sent ? (
              <form
                className="flex flex-col gap-3 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify();
                }}
              >
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to <strong>{email}</strong>.
                </p>
                <Label htmlFor="voter-code">Code</Label>
                <Input
                  id="voter-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <Button type="submit" disabled={busy || code.length !== 6}>
                  {busy ? "Checking…" : "Log in"}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => setSent(false)}
                >
                  Use a different email
                </Button>
              </form>
            ) : (
              <form
                className="flex flex-col gap-3 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
              >
                <Label htmlFor="voter-email">Email</Label>
                <Input
                  id="voter-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Email me a code"}
                </Button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="guest">
            <form
              className="flex flex-col gap-3 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                void guest();
              }}
            >
              <Label htmlFor="guest-name">Name</Label>
              <Input
                id="guest-name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Continue as guest"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
