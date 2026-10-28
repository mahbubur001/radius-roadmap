import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type FeedbackFilter,
  feedbackFilterSchema,
} from "@/lib/schemas/feedback";
import { db } from "@/server/db/client";
import { seesAllWorkspaces } from "@/server/services/context";
import {
  listBoards,
  listFeedback,
  listStatuses,
} from "@/server/services/feedback";
import { listCategories, listTags } from "@/server/services/roadmaps";
import { requireWorkspace } from "@/server/session";
import { FeedbackView } from "./feedback-view";

export const metadata: Metadata = { title: "Feedback" };

type Query = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) =>
  typeof v === "string" && v ? v : undefined;

export default function FeedbackPage({
  params,
  searchParams,
}: PageProps<"/[workspace]/feedback">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Feedback slug={params.then((p) => p.workspace)} query={searchParams} />
    </Suspense>
  );
}

async function Feedback({
  slug,
  query,
}: {
  slug: Promise<string>;
  query: Promise<Query>;
}) {
  const ctx = await requireWorkspace(await slug);
  const q = await query;

  const [boards, statuses, categories, tags] = await Promise.all([
    listBoards(db, ctx),
    listStatuses(db, ctx),
    listCategories(db, ctx),
    listTags(db, ctx),
  ]);
  const board = boards.find((b) => b.slug === one(q.b)) ?? boards[0];

  // Invalid values (hand-edited URLs) fall back to the defaults.
  const raw: FeedbackFilter = {
    boardId: board?.id,
    q: one(q.q),
    sort: one(q.sort) as FeedbackFilter["sort"],
    statusId: one(q.status),
    categoryId: one(q.category),
    tagId: one(q.tag),
    visibility: one(q.vis) as FeedbackFilter["visibility"],
    linked: one(q.linked) as FeedbackFilter["linked"],
    priority: one(q.priority) as FeedbackFilter["priority"],
    state: one(q.state) as FeedbackFilter["state"],
  };
  const parsed = feedbackFilterSchema.safeParse(raw);
  const filter = parsed.success
    ? parsed.data
    : feedbackFilterSchema.parse({ boardId: board?.id });

  const items = board ? await listFeedback(db, ctx, filter) : [];

  return (
    <FeedbackView
      key={board?.id ?? "none"}
      initialFeedbackId={one(q.feedback)}
      filter={filter}
      data={{
        workspace: ctx.workspaceSlug,
        workspaceId: ctx.workspaceId,
        canManage: seesAllWorkspaces(ctx),
        boards: boards.map((b) => ({
          id: b.id,
          slug: b.slug,
          name: b.name,
          isPublic: b.isPublic,
        })),
        boardId: board?.id ?? null,
        statuses: statuses.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          kind: s.kind,
        })),
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        })),
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
        items,
      }}
    />
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-full max-w-xl" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}
