import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ARTICLE_TABS, type ArticleTab } from "@/lib/schemas/articles";
import { db } from "@/server/db/client";
import { listArticleCategories } from "@/server/services/article-categories";
import {
  articleCounts,
  articleStats,
  listArticles,
} from "@/server/services/articles";
import { seesAllWorkspaces } from "@/server/services/context";
import { requireWorkspace } from "@/server/session";
import { ArticlesView } from "./articles-view";

export const metadata: Metadata = { title: "Articles" };

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default function ArticlesPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[workspace]/articles">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Articles slug={params.then((p) => p.workspace)} query={searchParams} />
    </Suspense>
  );
}

async function Articles({
  slug,
  query,
}: {
  slug: Promise<string>;
  query: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireWorkspace(await slug);
  const q = await query;
  const tabParam = one(q.tab);
  const tab: ArticleTab =
    ARTICLE_TABS.find((t) => t === tabParam) ?? "published";
  const search = one(q.q)?.slice(0, 100) || undefined;
  const categories = await listArticleCategories(db, ctx);
  const categoryParam = one(q.category);
  const category =
    categoryParam === "none" || categories.some((c) => c.id === categoryParam)
      ? categoryParam
      : undefined;
  const [items, counts, stats] = await Promise.all([
    listArticles(db, ctx, { tab, q: search, category }),
    articleCounts(db, ctx),
    articleStats(db, ctx, 30),
  ]);
  return (
    <ArticlesView
      workspace={ctx.workspaceSlug}
      canManage={seesAllWorkspaces(ctx)}
      tab={tab}
      query={search ?? ""}
      category={category ?? ""}
      counts={counts}
      stats={stats}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        icon: c.icon,
        articles: c.articles,
      }))}
      items={items}
    />
  );
}
