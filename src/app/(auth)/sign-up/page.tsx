import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Collect feedback, share your roadmap, announce what shipped."
      footer={
        <span>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-foreground underline">
            Sign in
          </Link>
        </span>
      }
    >
      {/* Reads ?next= and ?email= (runtime data), so it renders in Suspense. */}
      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>
    </AuthCard>
  );
}
