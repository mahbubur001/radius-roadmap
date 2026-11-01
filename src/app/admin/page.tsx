import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PLAN_IDS, PLANS } from "@/lib/plans";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { billing } from "@/server/services/plan-limits";
import { platformStats } from "@/server/services/platform/accounts";

export const metadata: Metadata = { title: "Overview" };

export default function AdminHome() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Stats />
    </Suspense>
  );
}

async function Stats() {
  await requirePlatformAdmin();
  const stats = await platformStats(db);
  const tiles = [
    { label: "Accounts", value: stats.total, href: "/admin/accounts" },
    {
      label: "New this week",
      value: stats.newThisWeek,
      href: "/admin/accounts",
    },
    {
      label: "Suspended",
      value: stats.suspended,
      href: "/admin/accounts?status=suspended",
    },
    {
      label: "Granted plans ending in 7 days",
      value: stats.overridesEndingSoon,
      href: "/admin/accounts",
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      {billing.enabled() ? null : (
        <p className="text-sm text-muted-foreground">
          Billing is off (no Stripe keys), so every account is unlimited. Plans
          below are what's stored.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="cursor-pointer hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">
                {t.value}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>By plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {PLAN_IDS.map((p) => (
            <Link
              key={p}
              href={`/admin/accounts?plan=${p}`}
              className="flex flex-col"
            >
              <span className="text-sm text-muted-foreground">
                {PLANS[p].name}
              </span>
              <span className="text-2xl font-semibold">
                {stats.plans[p] ?? 0}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
