import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLAN_IDS, PLANS, type PlanId } from "@/lib/plans";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import {
  type AccountStatus,
  listAccounts,
} from "@/server/services/platform/accounts";
import { AccountFilters } from "./filters";

export const metadata: Metadata = { title: "Accounts" };

const STATUSES: { value: AccountStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "awaiting_owner", label: "Waiting for the owner" },
  { value: "suspended", label: "Suspended" },
];

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

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
  const result = await listAccounts(db, {
    q: one(q.q),
    plan,
    status,
    page,
  });
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (one(q.q)) params.set("q", one(q.q) ?? "");
    if (plan) params.set("plan", plan);
    if (status) params.set("status", status);
    params.set("page", String(p));
    return `/admin/accounts?${params}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <Button asChild>
          <Link href="/admin/accounts/new">Invite a customer</Link>
        </Button>
      </div>
      <AccountFilters
        q={one(q.q) ?? ""}
        plan={plan ?? ""}
        status={status ?? ""}
        plans={PLAN_IDS.map((p) => ({ value: p, label: PLANS[p].name }))}
        statuses={STATUSES}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Workspaces</TableHead>
            <TableHead className="text-right">Members</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.accounts.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <Link
                  href={`/admin/accounts/${a.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {a.name}
                </Link>
                <div className="text-xs text-muted-foreground">/{a.slug}</div>
              </TableCell>
              <TableCell>
                <span className="flex flex-wrap items-center gap-1">
                  {PLANS[a.plan]?.name ?? a.plan}
                  {a.planSource === "manual" ? (
                    <Badge variant="secondary">
                      granted
                      {a.overrideEndsAt
                        ? ` to ${dateFormat.format(a.overrideEndsAt)}`
                        : ""}
                    </Badge>
                  ) : null}
                  {a.suspendedAt ? (
                    <Badge variant="destructive">suspended</Badge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="text-sm">
                {a.owner ?? (
                  <span className="text-muted-foreground">
                    {a.pendingOwner ? `invited: ${a.pendingOwner}` : "none"}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">{a.workspaces}</TableCell>
              <TableCell className="text-right">{a.members}</TableCell>
              <TableCell className="text-sm">
                {dateFormat.format(a.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {result.accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts match.</p>
      ) : null}
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
  );
}
