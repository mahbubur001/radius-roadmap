import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS } from "@/lib/plans";
import { db } from "@/server/db/client";
import { getBillingOverview } from "@/server/services/billing";
import { seesAllWorkspaces } from "@/server/services/context";
import { billing } from "@/server/services/plan-limits";
import { requireWorkspace } from "@/server/session";
import { ManageBillingButton, PlanPicker } from "./plan-picker";

export const metadata: Metadata = { title: "Billing" };

export default function BillingSettingsPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[workspace]/settings/billing">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BillingSettings
        slug={params.then((p) => p.workspace)}
        checkout={searchParams.then((q) => q.checkout === "success")}
      />
    </Suspense>
  );
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

async function BillingSettings({
  slug,
  checkout,
}: {
  slug: Promise<string>;
  checkout: Promise<boolean>;
}) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="billing" />;
  if (!billing.enabled()) {
    return (
      <SettingsSection
        title="Billing"
        description="Billing is turned off on this server, so every account has every feature."
      >
        {null}
      </SettingsSection>
    );
  }

  const overview = await getBillingOverview(db, ctx);
  const isOwner = ctx.role === "owner";
  const plan = PLANS[overview.plan];
  const ends = overview.currentPeriodEnd
    ? dateFormat.format(overview.currentPeriodEnd)
    : null;

  return (
    <>
      <SettingsSection
        title="Your plan"
        description={
          isOwner
            ? "Change plans, cards and invoices in Stripe's secure billing portal."
            : "Only account owners can change the plan."
        }
      >
        {(await checkout) ? (
          <p className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            Thanks! Your payment went through. The new plan shows here as soon
            as Stripe confirms it (usually a few seconds).
          </p>
        ) : null}
        {overview.status === "past_due" ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            Your last payment didn&apos;t go through. Update your payment
            details to keep the {plan.name} plan.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">{plan.name}</p>
            <p className="text-sm text-muted-foreground">
              {overview.plan === "free"
                ? "Free forever."
                : `Billed ${overview.interval === "year" ? "yearly" : "monthly"}. ${
                    overview.cancelAtPeriodEnd
                      ? `Ends on ${ends}, then moves to Free.`
                      : ends
                        ? `Renews on ${ends}.`
                        : ""
                  }`}
            </p>
          </div>
          {isOwner && overview.hasCustomer ? (
            <ManageBillingButton workspace={ctx.workspaceSlug} />
          ) : null}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {overview.usage.map((u) => (
            <li key={u.key} className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span>{u.label[0]?.toUpperCase() + u.label.slice(1)}</span>
                <span className="text-muted-foreground">
                  {u.used} / {u.limit === Infinity ? "Unlimited" : u.limit}
                </span>
              </div>
              <Progress
                value={
                  u.limit === Infinity
                    ? 0
                    : Math.min(100, (u.used / u.limit) * 100)
                }
              />
            </li>
          ))}
        </ul>
      </SettingsSection>
      <PlanPicker
        workspace={ctx.workspaceSlug}
        current={overview.plan}
        interval={overview.interval ?? "month"}
        canChange={isOwner}
      />
    </>
  );
}
