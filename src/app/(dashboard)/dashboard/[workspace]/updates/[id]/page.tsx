import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { listUpdateCategories } from "@/server/services/update-categories";
import { getUpdateDetail } from "@/server/services/updates";
import { requireWorkspace } from "@/server/session";
import { fileUrl } from "@/server/storage";
import { UpdateEditor } from "./update-editor";

export const metadata: Metadata = { title: "Edit post" };

export default function UpdateEditorPage({
  params,
}: PageProps<"/dashboard/[workspace]/updates/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace, id } = await params;
  const ctx = await requireWorkspace(workspace);
  const [post, categories] = await Promise.all([
    getUpdateDetail(db, ctx, id),
    listUpdateCategories(db, ctx),
  ]);
  return (
    <UpdateEditor
      // Remount when navigating between posts (e.g. after Duplicate).
      key={post.id}
      workspace={ctx.workspaceSlug}
      workspaceId={ctx.workspaceId}
      post={{ ...post, coverUrl: fileUrl(post.cover) }}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
      }))}
    />
  );
}
