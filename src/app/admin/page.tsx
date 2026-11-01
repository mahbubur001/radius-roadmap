import { ArrowUpRight, Ban, Clock, UserRoundX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS } from "@/lib/plans";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { billing } from "@/server/services/plan-limits";
import {
  needsAttention,
  platformStats,
  recentAccounts,
  signupsByDay,
} from "@/server/services/platform/accounts";
import {
  AccountMark,
  PageHeader,
  Panel,
  PlanPill,
  relative,
  shortDate,
} from "./ui";

export const metadata: Metadata = { title: "Overview" };

export default function AdminHome() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Overview />
    </Suspense>
  );
}

const dayLabel = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

async function Overview() {
  await requirePlatformAdmin();
  const [stats, days, recent, attention] = await Promise.all([
    platformStats(db),
    signupsByDay(db, 30),
    recentAccounts(db, 6),
    needsAttention(db),
  ]);
  const free = stats.plans.free ?? 0;
  const pro = stats.plans.pro ?? 0;
  const proShare = stats.total ? Math.round((pro / stats.total) * 100) : 0;
  const monthNew = days.reduce((sum, d) => sum + d.n, 0);
  const tiles = [
    {
      label: "Accounts",
      value: stats.total,
      note: `${monthNew.toLocaleString("en")} in the last 30 days`,
      href: "/admin/accounts",
    },
    {
      label: "New this week",
      value: stats.newThisWeek,
      note: "since 7 days ago",
      href: "/admin/accounts",
    },
    {
      label: "On Pro",
      value: pro,
      note: `${proShare}% of accounts`,
      href: "/admin/accounts?plan=pro",
    },
    {
      label: "Suspended",
      value: stats.suspended,
      note: stats.suspended ? "review below" : "none",
      href: "/admin/accounts?status=suspended",
    },
  ];
  const attentionCount =
    attention.ending.length +
    attention.suspended.length +
    attention.waiting.length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={shortDate.format(new Date())}
        title="Overview"
        description={
          billing.enabled()
            ? "How the business is doing, and which accounts need a look."
            : "Billing is off on this server (no Stripe keys), so every account gets Pro. The plans shown are what's stored."
        }
      />

      <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="group flex cursor-pointer flex-col gap-1 bg-card p-5 transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center justify-between text-sm text-muted-foreground">
              {t.label}
              <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
            </span>
            <span className="text-[32px] font-semibold tabular-nums tracking-[-0.03em]">
              {t.value.toLocaleString("en")}
            </span>
            <span className="text-xs text-muted-foreground">{t.note}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="New accounts"
          action={
            <span className="text-xs text-muted-foreground">Last 30 days</span>
          }
          className="lg:col-span-2"
        >
          <ColumnChart
            title={`${monthNew.toLocaleString("en")} new accounts`}
            unit="accounts"
            data={days.map((d) => ({
              key: d.day,
              label: dayLabel.format(new Date(`${d.day}T00:00:00Z`)),
              value: d.n,
            }))}
          />
        </Panel>

        <Panel title="Plan mix">
          <div className="flex flex-col gap-5">
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-semibold tabular-nums tracking-[-0.03em]">
                {proShare}%
              </span>
              <span className="text-sm text-muted-foreground">
                of accounts are on Pro
              </span>
            </div>
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${pro} on Pro, ${free} on Free`}
            >
              <span
                className="bg-(--admin-pro)"
                style={{ width: `${proShare}%` }}
              />
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              {(["pro", "free"] as const).map((p) => (
                <div key={p} className="flex items-center justify-between">
                  <dt className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${p === "pro" ? "bg-(--admin-pro)" : "bg-muted-foreground/30"}`}
                    />
                    <Link
                      href={`/admin/accounts?plan=${p}`}
                      className="hover:underline"
                    >
                      {PLANS[p].name}
                    </Link>
                  </dt>
                  <dd className="tabular-nums text-muted-foreground">
                    {(stats.plans[p] ?? 0).toLocaleString("en")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Needs attention"
          action={
            attentionCount ? (
              <span className="rounded-full bg-(--admin-warn)/15 px-2 py-0.5 text-xs font-medium text-(--admin-warn)">
                {attentionCount}
              </span>
            ) : null
          }
        >
          {attentionCount ? (
            <ul className="-my-2 flex flex-col divide-y">
              {attention.ending.map((a) => (
                <AttentionRow
                  key={`e-${a.id}`}
                  id={a.id}
                  name={a.name}
                  icon={<Clock className="size-4 text-(--admin-warn)" />}
                  detail={`Granted ${PLANS[a.plan].name} ends ${a.endsAt ? relative(a.endsAt) : ""}`}
                />
              ))}
              {attention.suspended.map((a) => (
                <AttentionRow
                  key={`s-${a.id}`}
                  id={a.id}
                  name={a.name}
                  icon={<Ban className="size-4 text-(--admin-danger)" />}
                  detail={`Suspended ${a.at ? relative(a.at) : ""}${a.reason ? `: ${a.reason}` : ""}`}
                />
              ))}
              {attention.waiting.map((a) => (
                <AttentionRow
                  key={`w-${a.id}`}
                  id={a.id}
                  name={a.name}
                  icon={<UserRoundX className="size-4 text-muted-foreground" />}
                  detail={
                    a.pendingOwner
                      ? `Waiting for ${a.pendingOwner} to accept`
                      : "No owner yet"
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing needs you right now.
            </p>
          )}
        </Panel>

        <Panel
          title="Recent signups"
          action={
            <Link
              href="/admin/accounts"
              className="text-xs text-primary hover:underline"
            >
              All accounts
            </Link>
          }
        >
          <ul className="-my-2 flex flex-col divide-y">
            {recent.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/accounts/${a.id}`}
                  className="flex cursor-pointer items-center gap-3 py-2.5"
                >
                  <AccountMark name={a.name} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {a.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {a.owner ?? a.pendingOwner ?? "No owner yet"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <PlanPill
                      plan={a.plan}
                      granted={a.planSource === "manual"}
                    />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {relative(a.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function AttentionRow({
  id,
  name,
  icon,
  detail,
}: {
  id: string;
  name: string;
  icon: React.ReactNode;
  detail: string;
}) {
  return (
    <li>
      <Link
        href={`/admin/accounts/${id}`}
        className="flex cursor-pointer items-center gap-3 py-2.5"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-muted">
          {icon}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {detail}
          </span>
        </span>
      </Link>
    </li>
  );
}
