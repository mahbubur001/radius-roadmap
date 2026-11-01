import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS, planFor } from "@/lib/plans";
import { db } from "@/server/db/client";
import { appOrigin } from "@/server/public-url";
import { getAccount } from "@/server/services/accounts";
import { seesAllWorkspaces } from "@/server/services/context";
import { hasFeature } from "@/server/services/plan-limits";
import { getDefaultWorkspace } from "@/server/services/public-site";
import { getWidgetSettings } from "@/server/services/widget";
import { requireWorkspace } from "@/server/session";
import { WidgetSettingsForm } from "./widget-settings-form";

export const metadata: Metadata = { title: "Widget" };

export default function WidgetPage({
  params,
}: PageProps<"/dashboard/[workspace]/widget">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-4xl" />}>
      <Widget slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function Widget({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="the widget settings" />;
  const [account, settings, defaultWorkspace, allowed] = await Promise.all([
    getAccount(db, ctx),
    getWidgetSettings(db, ctx),
    getDefaultWorkspace(db, ctx.accountId),
    hasFeature(db, ctx.accountId, "widget"),
  ]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Widget</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Show your latest updates and collect feedback inside your own app or
          website.
        </p>
      </div>
      {allowed ? null : (
        <p className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          The widget needs the {PLANS[planFor("widget")].name} plan. Until you
          upgrade it stays hidden on your site.{" "}
          <Link
            href={`/dashboard/${ctx.workspaceSlug}/settings/billing`}
            className="font-medium underline"
          >
            See plans
          </Link>
        </p>
      )}
      <WidgetSettingsForm
        workspace={ctx.workspaceSlug}
        origin={appOrigin()}
        site={account.slug}
        isDefault={ctx.workspaceSlug === defaultWorkspace}
        defaults={{ ...settings, color: settings.color ?? "" }}
      />
    </div>
  );
}
