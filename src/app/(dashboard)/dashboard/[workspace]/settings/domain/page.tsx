import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS, planFor } from "@/lib/plans";
import { db } from "@/server/db/client";
import { appOrigin } from "@/server/public-url";
import { getAccount } from "@/server/services/accounts";
import { seesAllWorkspaces } from "@/server/services/context";
import {
  customDomainsConfig,
  dnsRecords,
  getDomain,
  hostOrigin,
} from "@/server/services/custom-domains";
import { billing, hasFeature } from "@/server/services/plan-limits";
import { requireWorkspace } from "@/server/session";
import { PlanBadge } from "../branding/branding-form";
import { DomainSettings } from "./domain-settings";

export const metadata: Metadata = { title: "Custom domain" };

export default function DomainSettingsPage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/domain">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DomainPage slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function DomainPage({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="domain settings" />;
  const [account, domain, allowed] = await Promise.all([
    getAccount(db, ctx),
    getDomain(db, ctx),
    hasFeature(db, ctx.accountId, "customDomain"),
  ]);
  const plan = allowed ? null : PLANS[planFor("customDomain")].name;
  const billingHref = billing.enabled()
    ? `/dashboard/${ctx.workspaceSlug}/settings/billing`
    : null;

  return (
    <SettingsSection
      title={
        <>
          Custom domain <PlanBadge plan={plan} href={billingHref} />
        </>
      }
      description={`Serve your public site from your own domain, like feedback.yourcompany.com, instead of ${appOrigin()}/${account.slug}.`}
    >
      {customDomainsConfig.target() ? (
        <DomainSettings
          workspace={ctx.workspaceSlug}
          locked={!allowed}
          domain={
            domain
              ? {
                  hostname: domain.hostname,
                  status: domain.status,
                  error: domain.error,
                  url: hostOrigin(domain.hostname),
                  records: dnsRecords(domain),
                }
              : null
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Custom domains aren't set up on this server yet (
          <code>CUSTOM_DOMAIN_TARGET</code>).
        </p>
      )}
    </SettingsSection>
  );
}
