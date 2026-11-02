import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { requireUser } from "@/server/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your account" };

export default function OnboardingPage() {
  return (
    <AuthShell wide>
      <AuthCard
        title="Set up your account"
        description="Create your account and your first workspace (one per product or project)."
      >
        <Suspense fallback={null}>
          <SignedInGate />
        </Suspense>
        <OnboardingForm />
      </AuthCard>
    </AuthShell>
  );
}

async function SignedInGate() {
  await requireUser();
  return null;
}
