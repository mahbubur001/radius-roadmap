import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { publicSiteUrl } from "@/server/public-url";
import { getAccount } from "@/server/services/accounts";
import { listArticleCategories } from "@/server/services/article-categories";
import { getArticleDetail } from "@/server/services/articles";
import { activeHostname } from "@/server/services/custom-domains";
import { getDefaultWorkspace } from "@/server/services/public-site";
import { requireWorkspace } from "@/server/session";
import { ArticleEditor } from "./article-editor";

export const metadata: Metadata = { title: "Edit article" };

export default function ArticleEditorPage({
  params,
}: PageProps<"/dashboard/[workspace]/articles/[id]">) {
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
  const [article, categories, account, defaultWorkspace, customHost] =
    await Promise.all([
      getArticleDetail(db, ctx, id),
      listArticleCategories(db, ctx),
      getAccount(db, ctx),
      getDefaultWorkspace(db, ctx.accountId),
      activeHostname(db, ctx.accountId),
    ]);
  return (
    <ArticleEditor
      // Remount when navigating between articles (e.g. after Duplicate).
      key={article.id}
      workspace={ctx.workspaceSlug}
      workspaceId={ctx.workspaceId}
      publicBase={`${publicSiteUrl(account.slug, ctx.workspaceSlug, defaultWorkspace, customHost)}/articles`}
      article={article}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
      }))}
    />
  );
}
