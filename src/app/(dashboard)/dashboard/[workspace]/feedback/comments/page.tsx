import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { listPendingComments } from "@/server/services/comments";
import { getWorkspaceBySlug } from "@/server/services/workspaces";
import { requireWorkspace } from "@/server/session";
import { CommentsModeration } from "./comments-moderation";

export const metadata: Metadata = { title: "Comments to approve" };

/** Visitors' comments held for approval (doc 20 D3), across ideas and cards. */
export default function CommentsPage({
  params,
}: PageProps<"/dashboard/[workspace]/feedback/comments">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-3xl" />}>
      <Comments slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function Comments({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const [items, ws] = await Promise.all([
    listPendingComments(db, ctx),
    getWorkspaceBySlug(db, ctx, ctx.workspaceSlug),
  ]);
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        href={`/dashboard/${ctx.workspaceSlug}/feedback`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to feedback
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Comments to approve</h1>
        <p className="text-sm text-muted-foreground">
          {ws.settings.approveComments
            ? "Visitors' comments wait here until someone on the team approves them."
            : "“Approve comments first” is off in Public settings, so new comments go live straight away."}
        </p>
      </div>
      <CommentsModeration workspace={ctx.workspaceSlug} items={items} />
    </div>
  );
}
