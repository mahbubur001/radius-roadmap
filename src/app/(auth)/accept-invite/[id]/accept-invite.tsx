"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function AcceptInvite({
  invitationId,
  invitedEmail,
  signedInEmail,
}: {
  invitationId: string;
  invitedEmail: string;
  signedInEmail: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const back = encodeURIComponent(`/accept-invite/${invitationId}`);
  const email = encodeURIComponent(invitedEmail);

  if (!signedInEmail) {
    return (
      <div className="flex flex-col gap-3">
        <Button asChild className="w-full">
          <Link href={`/sign-up?next=${back}&email=${email}`}>
            Create an account
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/sign-in?next=${back}&email=${email}`}>
            I already have an account
          </Link>
        </Button>
      </div>
    );
  }

  if (signedInEmail.toLowerCase() !== invitedEmail.toLowerCase()) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as <strong>{signedInEmail}</strong>, but this
          invitation is for <strong>{invitedEmail}</strong>. Sign out to
          continue with the right account.
        </p>
        <SignOutButton redirectTo={`/accept-invite/${invitationId}`} />
      </div>
    );
  }

  async function accept() {
    setBusy(true);
    const { error } = await authClient.organization.acceptInvitation({
      invitationId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "This invitation is invalid or expired.");
      return;
    }
    // The accepted account is now active; "/" opens its first workspace.
    router.push("/");
    router.refresh();
  }

  return (
    <Button onClick={accept} disabled={busy} className="w-full">
      {busy ? "Joining…" : "Accept invitation"}
    </Button>
  );
}
