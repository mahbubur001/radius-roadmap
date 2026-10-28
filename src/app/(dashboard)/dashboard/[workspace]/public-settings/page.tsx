import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { appOrigin } from "@/server/public-url";
import { getAccount } from "@/server/services/accounts";
import { listRoadmaps } from "@/server/services/roadmaps";
import { requireWorkspace } from "@/server/session";
import { EmbedSettings } from "./embed-settings";

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
  const [account, roadmaps] = await Promise.all([
    getAccount(db, ctx),
    listRoadmaps(db, ctx),
  ]);
  return (
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
  );
}
