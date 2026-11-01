import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LIMIT_LABELS, normalizePlan, PLANS } from "@/lib/plans";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { NotFoundError } from "@/server/services/context";
import { accountDetail } from "@/server/services/platform/accounts";
import { AuditList } from "../../audit-list";
import { AccountMark, Panel, PlanPill, StatusDot, shortDate } from "../../ui";
import {
  OverrideForm,
  OwnerInviteControls,
  SuspendControl,
} from "./account-actions";

export const metadata: Metadata = { title: "Account" };

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
  const status = a.suspendedAt
    ? "suspended"
    : a.members.length === 0
      ? "awaiting_owner"
      : "active";
  const source =
    a.planSource === "manual"
      ? `Granted${a.override?.endsAt ? ` until ${shortDate.format(a.override.endsAt)}` : ", no end date"} by ${a.override?.setBy}`
      : a.planSource === "stripe"
        ? `Paid through Stripe${a.billing?.status ? ` (${a.billing.status})` : ""}`
        : "No subscription";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/accounts"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Accounts
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <AccountMark name={a.name} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
              {a.name}
            </h1>
            <PlanPill plan={a.plan} granted={a.planSource === "manual"} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono text-xs">/{a.slug}</span>
            <StatusDot status={status} />
            <span className="font-mono text-xs">
              Joined {shortDate.format(a.createdAt)}
            </span>
          </div>
        </div>
        {a.workspaces[0] ? (
          <a
            href={a.workspaces[0].publicUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted"
          >
            Public site
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </header>

      {a.suspendedAt ? (
        <Notice tone="danger">
          Suspended on {shortDate.format(a.suspendedAt)}: {a.suspendedReason}
        </Notice>
      ) : null}
      {a.doubleBilled ? (
        <Notice tone="warn">
          This account also pays through Stripe while a granted plan is on. End
          the granted plan, or refund them in Stripe.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Plan" className="lg:col-span-2">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-muted/50 p-4">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Now
                </span>
                <span className="text-lg font-semibold">
                  {PLANS[a.plan].name}
                </span>
                <span className="text-sm text-muted-foreground">{source}</span>
                {!a.billingOn ? (
                  <span className="text-xs text-muted-foreground">
                    Billing is off on this server: everything is unlocked.
                  </span>
                ) : null}
              </div>
              {a.billing?.customerId ? (
                <a
                  href={`https://dashboard.stripe.com/customers/${a.billing.customerId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  Stripe customer
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
            {a.override?.note ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Note:</span>{" "}
                {a.override.note}
              </p>
            ) : null}
            <OverrideForm
              accountId={a.id}
              current={
                a.override
                  ? {
                      plan: normalizePlan(a.override.plan),
                      endsOn,
                      note: a.override.note ?? "",
                    }
                  : null
              }
            />
          </div>
        </Panel>

        <Panel title="Usage">
          <dl className="flex flex-col gap-3 text-sm">
            {(Object.keys(a.usage) as (keyof typeof a.usage)[]).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <dt className="capitalize text-muted-foreground">
                  {LIMIT_LABELS[k]}
                </dt>
                <dd className="tabular-nums font-medium">
                  {a.usage[k]}
                  {a.limits[k] === Infinity ? (
                    ""
                  ) : (
                    <span className="text-muted-foreground">
                      {" "}
                      / {a.limits[k]}
                    </span>
                  )}
                </dd>
              </div>
            ))}
            <div className="my-1 h-px bg-border" />
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">API keys</dt>
              <dd className="tabular-nums font-medium">{a.apiKeys}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Webhooks</dt>
              <dd className="tabular-nums font-medium">{a.webhooks}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Custom domain</dt>
              <dd className="truncate font-mono text-xs">
                {a.domain
                  ? `${a.domain.hostname} (${a.domain.status})`
                  : "none"}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="People" className="lg:col-span-2">
          <div className="flex flex-col gap-4">
            {a.members.length ? (
              <ul className="-my-2 flex flex-col divide-y">
                {a.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <AccountMark name={m.name} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {m.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </span>
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nobody has joined yet.
              </p>
            )}
            {ownerInvite ? (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
                <p className="text-sm">
                  Owner invitation for <strong>{ownerInvite.email}</strong>
                  <span className="text-muted-foreground">
                    {" "}
                    · expires {shortDate.format(ownerInvite.expiresAt)}
                  </span>
                </p>
                <OwnerInviteControls
                  accountId={a.id}
                  email={ownerInvite.email}
                  empty={a.members.length === 0}
                />
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Workspaces">
          <ul className="-my-1 flex flex-col gap-1">
            {a.workspaces.map((w) => (
              <li key={w.id}>
                <a
                  href={w.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="truncate">{w.name}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="History" className="lg:col-span-2">
          <AuditList rows={a.history} showAccount={false} />
        </Panel>

        <Panel title="Danger zone" className="border-(--admin-danger)/30">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {a.suspendedAt
                ? "Restoring brings back the dashboard, public site, widget and API right away."
                : "Suspending switches off the dashboard, public site, widget, API keys, webhooks and emails. Nothing is deleted."}
            </p>
            <SuspendControl accountId={a.id} suspended={!!a.suspendedAt} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warn" | "danger";
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === "danger"
          ? "flex items-start gap-2 rounded-lg border border-(--admin-danger)/30 bg-(--admin-danger)/5 p-3 text-sm"
          : "flex items-start gap-2 rounded-lg border border-(--admin-warn)/40 bg-(--admin-warn)/10 p-3 text-sm"
      }
    >
      <TriangleAlert
        className={`mt-0.5 size-4 shrink-0 ${tone === "danger" ? "text-(--admin-danger)" : "text-(--admin-warn)"}`}
      />
      <span>{children}</span>
    </p>
  );
}
