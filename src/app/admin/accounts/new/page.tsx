import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { InviteCustomerForm } from "./invite-form";

export const metadata: Metadata = { title: "Invite a customer" };

export default function InviteCustomerPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Page />
    </Suspense>
  );
}

async function Page() {
  await requirePlatformAdmin();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Invite a customer
      </h1>
      <p className="max-w-xl text-sm text-muted-foreground">
        We create the account and its first workspace, and email the owner an
        invitation. They accept by creating a login (or signing in), and land in
        their new account as its owner.
      </p>
      <InviteCustomerForm />
    </div>
  );
}
