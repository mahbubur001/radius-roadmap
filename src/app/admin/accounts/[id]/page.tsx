import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LIMIT_LABELS, PLANS } from "@/lib/plans";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { NotFoundError } from "@/server/services/context";
import { accountDetail } from "@/server/services/platform/accounts";
import { AuditList } from "../../audit-list";
import {
  OverrideForm,
  OwnerInviteControls,
  SuspendControl,
} from "./account-actions";

export const metadata: Metadata = { title: "Account" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default function AccountPage({
  params,
}: PageProps<"/admin/accounts/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Account id={params.then((p) => p.id)} />
    </Suspense>
  );
}

async function Account({ id }: { id: Promise<string> }) {
  await requirePlatformAdmin();
  const a = await accountDetail(db, await id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const ownerInvite = a.invitations.find((i) => i.role === "owner");
  const endsOn = a.override?.endsAt?.toISOString().slice(0, 10) ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
        <Badge variant="secondary">{PLANS[a.plan].name}</Badge>
        {a.planSource === "manual" ? (
          <Badge variant="outline">granted</Badge>
        ) : null}
        {a.suspendedAt ? <Badge variant="destructive">suspended</Badge> : null}
        <span className="text-sm text-muted-foreground">
          /{a.slug} · created {dateFormat.format(a.createdAt)}
        </span>
      </div>
      {a.suspendedAt ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Suspended on {dateFormat.format(a.suspendedAt)}: {a.suspendedReason}
        </p>
      ) : null}
      {a.doubleBilled ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          This account also pays through Stripe while a granted plan is on. End
          the granted plan, or refund them in Stripe.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <p>
              Now: <strong>{PLANS[a.plan].name}</strong> (
              {a.planSource === "manual"
                ? `granted${a.override?.endsAt ? ` until ${dateFormat.format(a.override.endsAt)}` : ""} by ${a.override?.setBy}`
                : a.planSource === "stripe"
                  ? "paid through Stripe"
                  : "free"}
              ){a.billingOn ? "" : " · billing is off, everything is unlimited"}
            </p>
            {a.override?.note ? (
              <p className="text-muted-foreground">Note: {a.override.note}</p>
            ) : null}
            {a.billing?.customerId ? (
              <p className="text-muted-foreground">
                Stripe: {a.billing.status ?? "no subscription"} ·{" "}
                <a
                  href={`https://dashboard.stripe.com/customers/${a.billing.customerId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  open customer
                </a>
              </p>
            ) : null}
            <OverrideForm
              accountId={a.id}
              current={
                a.override
                  ? {
                      plan: a.override.plan,
                      endsOn,
                      note: a.override.note ?? "",
                    }
                  : null
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {(Object.keys(a.usage) as (keyof typeof a.usage)[]).map((k) => (
              <p key={k}>
                {a.usage[k]} / {a.limits[k] === Infinity ? "∞" : a.limits[k]}{" "}
                {LIMIT_LABELS[k]}
              </p>
            ))}
            <p>
              {a.apiKeys} API key{a.apiKeys === 1 ? "" : "s"} · {a.webhooks}{" "}
              webhook
              {a.webhooks === 1 ? "" : "s"}
              {a.domain
                ? ` · domain ${a.domain.hostname} (${a.domain.status})`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {a.members.length ? (
              <ul className="flex flex-col gap-1">
                {a.members.map((m) => (
                  <li key={m.id}>
                    {m.name} · {m.email} ·{" "}
                    <span className="text-muted-foreground">{m.role}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nobody has joined yet.</p>
            )}
            {ownerInvite ? (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <p>
                  Owner invitation for <strong>{ownerInvite.email}</strong>,
                  expires {dateFormat.format(ownerInvite.expiresAt)}.
                </p>
                <OwnerInviteControls
                  accountId={a.id}
                  email={ownerInvite.email}
                  empty={a.members.length === 0}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {a.workspaces.map((w) => (
                <li key={w.id}>
                  {w.name} ·{" "}
                  <a
                    href={w.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    public site
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suspension</CardTitle>
        </CardHeader>
        <CardContent>
          <SuspendControl accountId={a.id} suspended={!!a.suspendedAt} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">History</h2>
        <AuditList rows={a.history} showAccount={false} />
      </div>
    </div>
  );
}
