import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS, planFor } from "@/lib/plans";
import { db } from "@/server/db/client";
import { appOrigin } from "@/server/public-url";
import { listApiKeys } from "@/server/services/api-keys";
import { seesAllWorkspaces } from "@/server/services/context";
import { billing, hasFeature } from "@/server/services/plan-limits";
import { requireWorkspace } from "@/server/session";
import { PlanBadge } from "../branding/branding-form";
import { ApiKeys } from "./api-keys";

export const metadata: Metadata = { title: "API" };

export default function ApiSettingsPage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/api">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ApiSettings slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function ApiSettings({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="API settings" />;
  const [keys, allowed] = await Promise.all([
    listApiKeys(db, ctx),
    hasFeature(db, ctx.accountId, "api"),
  ]);
  const plan = allowed ? null : PLANS[planFor("api")].name;
  const billingHref = billing.enabled()
    ? `/dashboard/${ctx.workspaceSlug}/settings/billing`
    : null;

  return (
    <SettingsSection
      title={
        <>
          API keys <PlanBadge plan={plan} href={billingHref} />
        </>
      }
      description="Keys give programs access to this account's workspaces through the REST API. Send one as `Authorization: Bearer <key>`."
    >
      <p className="text-sm">
        Base URL <code>{appOrigin()}/api/v1</code> ·{" "}
        <Link
          href={`/dashboard/${ctx.workspaceSlug}/settings/api/reference`}
          className="text-primary underline"
        >
          API reference
        </Link>{" "}
        ·{" "}
        <a href="/api/v1/openapi.json" className="text-primary underline">
          openapi.json
        </a>
      </p>
      <ApiKeys
        workspace={ctx.workspaceSlug}
        locked={!allowed}
        keys={keys.map((k) => ({
          ...k,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </SettingsSection>
  );
}
