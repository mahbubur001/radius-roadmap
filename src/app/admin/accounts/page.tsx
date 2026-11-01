import { ChevronRight, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PLAN_IDS, PLANS, type PlanId } from "@/lib/plans";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import {
  type AccountStatus,
  listAccounts,
} from "@/server/services/platform/accounts";
import {
  AccountMark,
  PageHeader,
  PlanPill,
  relative,
  StatusDot,
  shortDate,
} from "../ui";
import { AccountFilters } from "./filters";

export const metadata: Metadata = { title: "Accounts" };

const STATUSES: { value: AccountStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "awaiting_owner", label: "Waiting for owner" },
  { value: "suspended", label: "Suspended" },
];

type Query = { q?: string; plan?: string; status?: string; page?: string };

export default function AccountsPage({
  searchParams,
}: PageProps<"/admin/accounts">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Accounts query={searchParams as Promise<Query>} />
    </Suspense>
  );
}

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

async function Accounts({ query }: { query: Promise<Query> }) {
  await requirePlatformAdmin();
  const q = await query;
  const plan = PLAN_IDS.includes(one(q.plan) as PlanId)
    ? (one(q.plan) as PlanId)
    : undefined;
  const status = STATUSES.some((s) => s.value === one(q.status))
    ? (one(q.status) as AccountStatus)
    : undefined;
  const page = Math.max(1, Number(one(q.page)) || 1);
  const result = await listAccounts(db, { q: one(q.q), plan, status, page });
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (one(q.q)) params.set("q", one(q.q) ?? "");
    if (plan) params.set("plan", plan);
    if (status) params.set("status", status);
    params.set("page", String(p));
    return `/admin/accounts?${params}`;
  };
  const filtered = !!(one(q.q) || plan || status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Customers"
        title="Accounts"
        description="Every company using Radius Roadmap. Open one to change its plan, see its people, or suspend it."
        actions={
          <Button asChild>
            <Link href="/admin/accounts/new">
              <UserPlus />
              Invite a customer
            </Link>
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-4">
          <AccountFilters
            q={one(q.q) ?? ""}
            plan={plan ?? ""}
            status={status ?? ""}
            plans={PLAN_IDS.map((p) => ({ value: p, label: PLANS[p].name }))}
            statuses={STATUSES}
          />
        </div>

        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_5rem_5rem_7rem_1.5rem] gap-4 border-b bg-muted/40 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground lg:grid">
          <span>Account</span>
          <span>Plan</span>
          <span>Owner</span>
          <span className="text-right">Spaces</span>
          <span className="text-right">People</span>
          <span>Created</span>
          <span />
        </div>

        {result.accounts.length ? (
          <ul className="divide-y">
            {result.accounts.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/accounts/${a.id}`}
                  className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_5rem_5rem_7rem_1.5rem]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <AccountMark name={a.name} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{a.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          /{a.slug}
                        </span>
                        <StatusDot
                          status={
                            a.suspendedAt
                              ? "suspended"
                              : a.members === 0
                                ? "awaiting_owner"
                                : "active"
                          }
                        />
                      </span>
                    </span>
                  </span>
                  <span>
                    <PlanPill
                      plan={a.plan}
                      granted={a.planSource === "manual"}
                    />
                    {a.planSource === "manual" && a.overrideEndsAt ? (
                      <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                        to {shortDate.format(a.overrideEndsAt)}
                      </span>
                    ) : null}
                  </span>
                  <span className="hidden truncate text-sm lg:block">
                    {a.owner ?? (
                      <span className="text-muted-foreground">
                        {a.pendingOwner
                          ? `Invited: ${a.pendingOwner}`
                          : "No owner"}
                      </span>
                    )}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums lg:block">
                    {a.workspaces}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums lg:block">
                    {a.members}
                  </span>
                  <span
                    className="hidden font-mono text-xs text-muted-foreground lg:block"
                    title={shortDate.format(a.createdAt)}
                  >
                    {relative(a.createdAt)}
                  </span>
                  <ChevronRight className="hidden size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 lg:block" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <p className="font-medium">
              {filtered ? "No accounts match" : "No accounts yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {filtered ? (
                <>
                  Try another search, or{" "}
                  <Link
                    href="/admin/accounts"
                    className="text-primary hover:underline"
                  >
                    clear the filters
                  </Link>
                  .
                </>
              ) : (
                "Invite your first customer to get started."
              )}
            </p>
          </div>
        )}

        {result.page > 1 || result.hasMore ? (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
            <span className="font-mono text-xs">Page {result.page}</span>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={link(result.page - 1)}>Previous</Link>
                </Button>
              ) : null}
              {result.hasMore ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={link(result.page + 1)}>Next</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
