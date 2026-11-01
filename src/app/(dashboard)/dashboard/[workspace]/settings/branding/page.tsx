import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { ImageUpload } from "@/components/form/image-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { findFont } from "@/lib/fonts";
import { type Feature, PLANS, planFor, planIncludes } from "@/lib/plans";
import { MAX_FAVICON_BYTES } from "@/lib/schemas/upload";
import { db } from "@/server/db/client";
import { getAccount } from "@/server/services/accounts";
import { getBranding } from "@/server/services/branding";
import { seesAllWorkspaces } from "@/server/services/context";
import { billing, getAccountPlan } from "@/server/services/plan-limits";
import { requireWorkspace } from "@/server/session";
import { fileUrl } from "@/server/storage";
import { BrandingForm, PlanBadge } from "./branding-form";

export const metadata: Metadata = { title: "Branding" };

export default function BrandingSettingsPage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/branding">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BrandingSettings slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function BrandingSettings({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="branding" />;
  const [account, branding, plan] = await Promise.all([
    getAccount(db, ctx),
    getBranding(db, ctx.accountId),
    getAccountPlan(db, ctx.accountId),
  ]);
  /** Plan name a feature needs, or null when the plan has it. */
  const needs = (feature: Feature) =>
    planIncludes(plan, feature) ? null : PLANS[planFor(feature)].name;
  const billingHref = billing.enabled()
    ? `/dashboard/${ctx.workspaceSlug}/settings/billing`
    : null;
  const logoUrl = fileUrl(account.logo);

  return (
    <>
      <SettingsSection
        title={
          <>
            Logo <PlanBadge plan={needs("logo")} href={billingHref} />
          </>
        }
        description="Shown on your public sites, widget and emails to your users. Workspaces can have their own logo too."
      >
        <ImageUpload
          purpose="account-logo"
          name={account.name}
          url={logoUrl}
          rounded="md"
        />
      </SettingsSection>
      <SettingsSection
        title={
          <>
            Favicon <PlanBadge plan={needs("whiteLabel")} href={billingHref} />
          </>
        }
        description="The browser tab icon on your public sites. Square, at least 32×32. Without one, your logo is used."
      >
        <ImageUpload
          purpose="account-favicon"
          name={account.name}
          url={fileUrl(branding.favicon ?? null)}
          rounded="md"
          maxBytes={MAX_FAVICON_BYTES}
          disabled={!!needs("whiteLabel")}
        />
      </SettingsSection>
      <BrandingForm
        workspace={ctx.workspaceSlug}
        account={{ name: account.name, logoUrl }}
        billingHref={billingHref}
        locked={{
          color: needs("whiteLabel"),
          font: needs("customFonts"),
          hidePoweredBy: needs("hidePoweredBy"),
        }}
        defaults={{
          color: branding.color ?? "",
          font: findFont(branding.font)?.id ?? "",
          hidePoweredBy: !!branding.hidePoweredBy,
        }}
      />
    </>
  );
}
