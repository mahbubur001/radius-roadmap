"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  checkoutAction,
  portalAction,
} from "@/app/(dashboard)/_actions/billing";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type BillingInterval,
  FEATURE_LABELS,
  type LimitKey,
  limitText,
  PLAN_IDS,
  PLANS,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

const LIMIT_KEYS: LimitKey[] = [
  "teammates",
  "workspaces",
  "roadmaps",
  "boards",
];

/** Sends the browser to a Stripe page returned by an action. */
async function go(
  run: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>,
) {
  const result = await run();
  if (!result.ok) {
    toast.error(result.error);
    return false;
  }
  window.location.assign(result.data);
  return true;
}

export function ManageBillingButton({ workspace }: { workspace: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        if (!(await go(() => portalAction({ workspace })))) setBusy(false);
      }}
    >
      Manage billing
    </Button>
  );
}

export function PlanPicker({
  workspace,
  current,
  interval: initialInterval,
  canChange,
}: {
  workspace: string;
  current: PlanId;
  interval: BillingInterval;
  canChange: boolean;
}) {
  const [interval, setBillingInterval] =
    useState<BillingInterval>(initialInterval);
  const [busy, setBusy] = useState<PlanId | null>(null);

  async function choose(plan: PlanId) {
    setBusy(plan);
    const ok = await go(() =>
      plan === "free"
        ? portalAction({ workspace })
        : checkoutAction({ workspace, plan, interval }),
    );
    if (!ok) setBusy(null);
  }

  return (
    <SettingsSection
      title="Plans"
      description="Paid features switch on as soon as Stripe confirms the payment. Downgrading never deletes anything."
    >
      <Tabs
        value={interval}
        onValueChange={(v) => setBillingInterval(v as BillingInterval)}
      >
        <TabsList>
          <TabsTrigger value="month">Monthly</TabsTrigger>
          <TabsTrigger value="year">Yearly (save 20%)</TabsTrigger>
        </TabsList>
      </Tabs>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const price = plan.price[interval];
          const isCurrent = id === current;
          const previous = PLAN_IDS[PLAN_IDS.indexOf(id) - 1];
          const added = plan.features.filter(
            (f) => !previous || !PLANS[previous].features.includes(f),
          );
          return (
            <li
              key={id}
              className={cn(
                "flex flex-col gap-4 rounded-lg border bg-card p-4",
                isCurrent && "border-primary ring-1 ring-primary",
              )}
            >
              <div>
                <p className="font-semibold">{plan.name}</p>
                <p className="mt-1">
                  <span className="text-2xl font-semibold">
                    ${Number.isInteger(price) ? price : price.toFixed(2)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {" "}
                    / month
                  </span>
                </p>
                {interval === "year" && price > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    ${(price * 12).toFixed(2)} billed yearly
                  </p>
                ) : null}
              </div>
              <ul className="flex flex-1 flex-col gap-1.5 text-sm">
                {LIMIT_KEYS.map((key) => (
                  <li key={key}>{limitText(key, plan.limits[key])}</li>
                ))}
                {previous && added.length ? (
                  <li className="mt-2 text-xs font-medium text-muted-foreground">
                    Everything in {PLANS[previous].name}, plus:
                  </li>
                ) : null}
                {added.map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {FEATURE_LABELS[f]}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <Button variant="outline" disabled>
                  Current plan
                </Button>
              ) : canChange ? (
                <Button
                  variant={id === "free" ? "outline" : "default"}
                  disabled={
                    busy !== null || (id === "free" && current === "free")
                  }
                  onClick={() => choose(id)}
                >
                  {busy === id
                    ? "Opening Stripe…"
                    : PLAN_IDS.indexOf(id) > PLAN_IDS.indexOf(current)
                      ? `Upgrade to ${plan.name}`
                      : `Switch to ${plan.name}`}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SettingsSection>
  );
}
