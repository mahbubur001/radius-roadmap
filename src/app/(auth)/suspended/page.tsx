import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Account suspended" };

/** Where team members of a suspended account land (doc 28 C8). */
export default function SuspendedPage() {
  return (
    <AuthCard
      title="This account is suspended"
      description="Its dashboard, public site, widget and API are switched off for now. Nothing has been deleted."
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Reply to any email from us, or contact support, to find out why and to
          have it restored.
        </p>
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
