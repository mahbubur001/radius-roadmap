import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthCard
      title="Check your email"
      description="We sent you a link to verify your email address. Open it to finish signing up."
      footer={
        <Link href="/sign-in" className="text-foreground underline">
          Back to sign in
        </Link>
      }
    >
      <p className="text-sm text-muted-foreground">
        Didn&apos;t get it? Check your spam folder, or sign in again to receive
        a new link.
      </p>
    </AuthCard>
  );
}
