import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back to Radius Roadmap."
      footer={
        <span>
          No account?{" "}
          <Link href="/sign-up" className="text-foreground underline">
            Create one
          </Link>
        </span>
      }
    >
      <SignInForm />
    </AuthCard>
  );
}
