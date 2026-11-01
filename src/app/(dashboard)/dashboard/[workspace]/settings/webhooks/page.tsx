import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS, planFor } from "@/lib/plans";
import { db } from "@/server/db/client";
import { seesAllWorkspaces } from "@/server/services/context";
import { billing, hasFeature } from "@/server/services/plan-limits";
import { listEndpoints } from "@/server/services/webhooks";
import { requireWorkspace } from "@/server/session";
import { PlanBadge } from "../branding/branding-form";
import { Webhooks } from "./webhooks";

export const metadata: Metadata = { title: "Webhooks" };

export default function WebhooksSettingsPage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/webhooks">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WebhooksSettings slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function WebhooksSettings({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="webhooks" />;
  const [endpoints, allowed] = await Promise.all([
    listEndpoints(db, ctx),
    hasFeature(db, ctx.accountId, "webhooks"),
  ]);
  const plan = allowed ? null : PLANS[planFor("webhooks")].name;
  const billingHref = billing.enabled()
    ? `/dashboard/${ctx.workspaceSlug}/settings/billing`
    : null;

  return (
    <SettingsSection
      title={
        <>
          Webhooks <PlanBadge plan={plan} href={billingHref} />
        </>
      }
      description="We POST a signed JSON event to your URL when something changes in any workspace of this account. Verify the X-RadiusRoadmap-Signature header (t=…,v1=HMAC-SHA256 of “t.body” with the signing secret)."
    >
      <Webhooks
        workspace={ctx.workspaceSlug}
        locked={!allowed}
        endpoints={endpoints.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
          failingSince: e.failingSince?.toISOString() ?? null,
        }))}
      />
    </SettingsSection>
  );
}
