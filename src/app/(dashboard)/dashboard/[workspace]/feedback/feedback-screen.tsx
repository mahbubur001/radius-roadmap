import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type FeedbackFilter,
  feedbackFilterSchema,
} from "@/lib/schemas/feedback";
import { db } from "@/server/db/client";
import { seesAllWorkspaces } from "@/server/services/context";
import {
  boardCounts,
  inboxCount,
  listBoards,
  listFeedback,
  listStatuses,
} from "@/server/services/feedback";
import { listCategories, listTags } from "@/server/services/roadmaps";
import { requireWorkspace } from "@/server/session";
import { FeedbackView } from "./feedback-view";
import type { FeedbackMode } from "./types";

export type Query = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) =>
  typeof v === "string" && v ? v : undefined;

/** Feedback list or triage inbox (doc 20 §1). Shared by both pages. */
export function FeedbackScreen({
  slug,
  query,
  mode,
}: {
  slug: Promise<string>;
  query: Promise<Query>;
  mode: FeedbackMode;
}) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Feedback slug={slug} query={query} mode={mode} />
    </Suspense>
  );
}

async function Feedback({
  slug,
  query,
  mode,
}: {
  slug: Promise<string>;
  query: Promise<Query>;
  mode: FeedbackMode;
}) {
  const ctx = await requireWorkspace(await slug);
  const q = await query;

  const [boards, counts, statuses, categories, tags, pending] =
    await Promise.all([
      listBoards(db, ctx),
      boardCounts(db, ctx),
      listStatuses(db, ctx),
      listCategories(db, ctx),
      listTags(db, ctx),
      inboxCount(db, ctx),
    ]);
  const board = boards.find((b) => b.slug === one(q.b)) ?? boards[0];
  const inbox = mode === "inbox";

  // Invalid values (hand-edited URLs) fall back to the defaults.
  // The inbox covers every board, oldest first.
  const raw: FeedbackFilter = {
    boardId: inbox ? undefined : board?.id,
    q: one(q.q),
    sort: (one(q.sort) ??
      (inbox ? "oldest" : undefined)) as FeedbackFilter["sort"],
    statusId: one(q.status),
    categoryId: one(q.category),
    tagId: one(q.tag),
    visibility: one(q.vis) as FeedbackFilter["visibility"],
    linked: one(q.linked) as FeedbackFilter["linked"],
    priority: one(q.priority) as FeedbackFilter["priority"],
    state: one(q.state) as FeedbackFilter["state"],
    review: inbox ? "pending" : undefined,
  };
  const parsed = feedbackFilterSchema.safeParse(raw);
  const filter = parsed.success
    ? parsed.data
    : feedbackFilterSchema.parse({
        boardId: inbox ? undefined : board?.id,
        sort: inbox ? "oldest" : undefined,
        review: inbox ? "pending" : undefined,
      });

  const items = board ? await listFeedback(db, ctx, filter) : [];

  return (
    <FeedbackView
      key={`${mode}:${board?.id ?? "none"}`}
      mode={mode}
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
          description: b.description,
          isPublic: b.isPublic,
          autoPublish: b.autoPublish,
          openCount: counts[b.id] ?? 0,
        })),
        boardId: board?.id ?? null,
        inboxCount: pending,
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
