import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { PageHeader, Panel } from "../../ui";
import { InviteCustomerForm } from "./invite-form";

export const metadata: Metadata = { title: "Invite a customer" };

export default function InviteCustomerPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Page />
    </Suspense>
  );
}

const STEPS = [
  "We create the account and its first workspace, ready to use.",
  "The owner gets an email and accepts with a new or existing login.",
  "They land in their account as owner, on the plan you chose.",
];

async function Page() {
  await requirePlatformAdmin();
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/accounts"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Accounts
      </Link>
      <PageHeader
        eyebrow="Customers"
        title="Invite a customer"
        description="Set up an account for a company and hand it to its owner."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel>
          <InviteCustomerForm />
        </Panel>
        <Panel title="What happens">
          <ol className="flex flex-col gap-4 text-sm">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs font-medium text-primary">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
