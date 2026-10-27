import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { requireUser } from "@/server/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your account" };

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <AuthCard
          title="Set up your account"
          description="Create your account and your first workspace (one per product or project)."
        >
          <Suspense fallback={null}>
            <SignedInGate />
          </Suspense>
          <OnboardingForm />
        </AuthCard>
      </div>
    </main>
  );
}

async function SignedInGate() {
  await requireUser();
  return null;
}
