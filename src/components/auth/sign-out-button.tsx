"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({
  variant = "outline",
  redirectTo = "/sign-in",
}: {
  variant?: "outline" | "default";
  /** Where to go after signing out. */
  redirectTo?: string;
}) {
  const router = useRouter();
  return (
    <Button
      variant={variant}
      onClick={async () => {
        await authClient.signOut();
        router.push(redirectTo);
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
