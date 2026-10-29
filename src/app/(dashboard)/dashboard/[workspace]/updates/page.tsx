import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { UPDATE_TABS, type UpdateTab } from "@/lib/schemas/updates";
import { db } from "@/server/db/client";
import { seesAllWorkspaces } from "@/server/services/context";
import { listUpdateCategories } from "@/server/services/update-categories";
import { listUpdates, updateCounts } from "@/server/services/updates";
import { requireWorkspace } from "@/server/session";
import { UpdatesView } from "./updates-view";

export const metadata: Metadata = { title: "Updates" };

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default function UpdatesPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[workspace]/updates">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Updates slug={params.then((p) => p.workspace)} query={searchParams} />
    </Suspense>
  );
}

async function Updates({
  slug,
  query,
}: {
  slug: Promise<string>;
  query: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireWorkspace(await slug);
  const q = await query;
  const tabParam = one(q.tab);
  const tab: UpdateTab = UPDATE_TABS.find((t) => t === tabParam) ?? "published";
  const search = one(q.q)?.slice(0, 100) || undefined;
  const categories = await listUpdateCategories(db, ctx);
  const categoryParam = one(q.category);
  const categoryId = categories.some((c) => c.id === categoryParam)
    ? categoryParam
    : undefined;
  const [items, counts] = await Promise.all([
    listUpdates(db, ctx, { tab, q: search, categoryId }),
    updateCounts(db, ctx),
  ]);
  return (
    <UpdatesView
      workspace={ctx.workspaceSlug}
      canManage={seesAllWorkspaces(ctx)}
      tab={tab}
      query={search ?? ""}
      categoryId={categoryId ?? ""}
      counts={counts}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
      }))}
      items={items}
    />
  );
}
