import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "No workspace access" };

export default function NoAccessPage() {
  return (
    <AuthCard
      title="No workspaces yet"
      description="You're a member of this account, but no workspace has been shared with you."
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Ask an owner or admin to give you access to a workspace, then reload
          this page.
        </p>
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
