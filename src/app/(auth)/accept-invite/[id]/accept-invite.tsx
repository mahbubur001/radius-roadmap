"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";

export function AcceptInvite({ idPromise }: { idPromise: Promise<string> }) {
  const invitationId = use(idPromise);
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [busy, setBusy] = useState(false);

  if (isPending) return null;

  if (!session) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/sign-in" className="text-foreground underline">
          Sign in
        </Link>{" "}
        or{" "}
        <Link href="/sign-up" className="text-foreground underline">
          create an account
        </Link>{" "}
        with the invited email, then open this link again.
      </p>
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
    router.push("/");
    router.refresh();
  }

  return (
    <Button onClick={accept} disabled={busy} className="w-full">
      Accept invitation
    </Button>
  );
}
