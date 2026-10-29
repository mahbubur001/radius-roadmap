import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultDisplay } from "@/lib/schemas/roadmap";
import { db } from "@/server/db/client";
import { publicRoadmapUrl } from "@/server/public-url";
import { getAccount } from "@/server/services/accounts";
import { listBoardCards } from "@/server/services/cards";
import { seesAllWorkspaces } from "@/server/services/context";
import {
  listColumns,
  listObjectives,
  listRoadmaps,
  listTags,
} from "@/server/services/roadmaps";
import { getWorkspaceBySlug } from "@/server/services/workspaces";
import { requireWorkspace } from "@/server/session";
import { NoRoadmap } from "./no-roadmap";
import { RoadmapView } from "./roadmap-view";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[workspace]/roadmap">) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <Roadmap
        slug={params.then((p) => p.workspace)}
        query={searchParams.then((q) => ({
          roadmap: typeof q.r === "string" ? q.r : undefined,
          card: typeof q.card === "string" ? q.card : undefined,
        }))}
      />
    </Suspense>
  );
}

async function Roadmap({
  slug,
  query,
}: {
  slug: Promise<string>;
  query: Promise<{ roadmap?: string; card?: string }>;
}) {
  const ctx = await requireWorkspace(await slug);
  const { roadmap: roadmapSlug, card } = await query;
  const canManage = seesAllWorkspaces(ctx);

  const roadmaps = await listRoadmaps(db, ctx);
  const roadmap = roadmaps.find((r) => r.slug === roadmapSlug) ?? roadmaps[0];
  if (!roadmap) {
    return <NoRoadmap workspace={ctx.workspaceSlug} canManage={canManage} />;
  }

  const [columns, cards, objectives, tags, account, ws] = await Promise.all([
    listColumns(db, ctx, roadmap.id),
    listBoardCards(db, ctx, roadmap.id),
    listObjectives(db, ctx),
    listTags(db, ctx),
    getAccount(db, ctx),
    getWorkspaceBySlug(db, ctx, ctx.workspaceSlug),
  ]);

  return (
    <RoadmapView
      // Remount when switching roadmaps so local board state resets.
      key={roadmap.id}
      initialCardId={card}
      data={{
        workspace: ctx.workspaceSlug,
        workspaceId: ctx.workspaceId,
        canManage,
        publicComments: !!ws.settings.commentsEnabled,
        publicUrl: publicRoadmapUrl(account.slug, ctx.workspaceSlug),
        roadmaps: roadmaps.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.internalTitle,
        })),
        roadmap: {
          id: roadmap.id,
          slug: roadmap.slug,
          internalTitle: roadmap.internalTitle,
          publicTitle: roadmap.publicTitle,
          internalSummary: roadmap.internalSummary,
          publicSummary: roadmap.publicSummary,
          isPublic: roadmap.isPublic,
          display: { ...defaultDisplay, ...roadmap.display },
        },
        columns: columns.map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position,
          isPublic: c.isPublic,
          isDone: c.isDone,
        })),
        cards,
        objectives: objectives.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        })),
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
      }}
    />
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-96 w-72 shrink-0" />
        ))}
      </div>
    </div>
  );
}
