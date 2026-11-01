import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { type Feature, PLANS, planFor } from "@/lib/plans";
import { db } from "@/server/db/client";
import { appOrigin } from "@/server/public-url";
import { getAccount } from "@/server/services/accounts";
import { seesAllWorkspaces } from "@/server/services/context";
import { hasFeature } from "@/server/services/plan-limits";
import { listRoadmaps } from "@/server/services/roadmaps";
import { getWorkspaceBySlug } from "@/server/services/workspaces";
import { requireWorkspace } from "@/server/session";
import { EmbedSettings } from "./embed-settings";
import { PublicSiteForm } from "./public-site-form";

export const metadata: Metadata = { title: "Public settings" };

export default function PublicSettingsPage({
  params,
}: PageProps<"/dashboard/[workspace]/public-settings">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-3xl" />}>
      <PublicSettings slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function PublicSettings({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const [account, roadmaps, ws, comments, follows] = await Promise.all([
    getAccount(db, ctx),
    listRoadmaps(db, ctx),
    getWorkspaceBySlug(db, ctx, ctx.workspaceSlug),
    hasFeature(db, ctx.accountId, "comments"),
    hasFeature(db, ctx.accountId, "follows"),
  ]);
  const needs = (feature: Feature) => PLANS[planFor(feature)].name;
  const { settings } = ws;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PublicSiteForm
        workspace={ctx.workspaceSlug}
        canManage={seesAllWorkspaces(ctx)}
        locked={{
          comments: comments ? null : needs("comments"),
          follows: follows ? null : needs("follows"),
        }}
        defaults={{
          showRoadmap: settings.showRoadmap !== false,
          showIdeas: settings.showIdeas !== false,
          showUpdates: settings.showUpdates !== false,
          showArticles: settings.showArticles !== false,
          commentsEnabled: !!settings.commentsEnabled,
          approveComments: !!settings.approveComments,
          followsEnabled: !!settings.followsEnabled,
          showLogo: settings.showLogo !== false,
          roadmapLabel: settings.roadmapLabel ?? "",
          updatesLabel: settings.updatesLabel ?? "",
          ideasLabel: settings.ideasLabel ?? "",
          articlesLabel: settings.articlesLabel ?? "",
          termsUrl: settings.termsUrl ?? "",
          privacyUrl: settings.privacyUrl ?? "",
        }}
      />
      <EmbedSettings
        origin={appOrigin()}
        account={account.slug}
        workspace={ctx.workspaceSlug}
        roadmaps={roadmaps
          .filter((r) => r.isPublic)
          .map((r) => ({
            slug: r.slug,
            title: r.publicTitle ?? r.internalTitle,
          }))}
      />
    </div>
  );
}
