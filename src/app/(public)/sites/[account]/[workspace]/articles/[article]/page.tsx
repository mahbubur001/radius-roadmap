import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleRating } from "@/components/public/article-rating";
import { PageView } from "@/components/public/page-view";
import { ArticleList, articleDate } from "@/components/public/public-articles";
import { Skeleton } from "@/components/ui/skeleton";
import { loadArticle, loadSite, loadWorkspace, siteUrl } from "../../../data";
import { SiteShell } from "../../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/articles/[article]">;

async function load(props: Props) {
  const { account, workspace, article } = await props.params;
  const query = await props.searchParams;
  const site = await loadSite(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.articles) return null;
  const found = await loadArticle(site.accountId, ws.id, article);
  if (!found) return null;
  return {
    origin: siteUrl(site.slug),
    site,
    ws,
    article: found,
    embed: query.embed === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, article, embed } = data;
  const indexable = ws.settings.indexPublicPages !== false && !embed;
  const description = article.excerpt || `${article.title}: ${ws.name} help.`;
  return {
    title: { absolute: `${article.title} · ${ws.name} help` },
    description,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: `${origin}/${ws.slug}/articles/${article.slug}` },
    openGraph: {
      title: article.title,
      description,
      type: "article",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
    },
  };
}

export default function PublicArticlePage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-3xl" />}>
      <Article {...props} />
    </Suspense>
  );
}

async function Article(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, article, embed } = data;
  const base = `/${site.slug}/${ws.slug}/articles`;
  const suffix = embed ? "?embed=1" : "";
  return (
    <SiteShell
      account={site.slug}
      workspace={ws}
      active="articles"
      embed={embed}
    >
      <PageView articleId={article.id} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          <Link href={`${base}${suffix}`} className="hover:text-foreground">
            Articles
          </Link>
          {article.category ? (
            <>
              <ChevronRight className="size-3.5" />
              <Link
                href={`${base}/category/${article.category.slug}${suffix}`}
                className="hover:text-foreground"
              >
                {article.category.name}
              </Link>
            </>
          ) : null}
        </nav>
        <article className="flex flex-col gap-4 rounded-lg border bg-card px-6 pt-6 pb-8 sm:px-10">
          <h1 className="text-3xl font-semibold tracking-tight">
            {article.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Updated{" "}
            <time dateTime={article.updatedAt}>
              {articleDate(article.updatedAt)}
            </time>
          </p>
          {article.html ? (
            <div
              className="rich-text"
              // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
              dangerouslySetInnerHTML={{ __html: article.html }}
            />
          ) : null}
          <ArticleRating articleId={article.id} />
        </article>
        {article.related.length ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              More in {article.category?.name ?? "this category"}
            </h2>
            <ArticleList
              articles={article.related}
              base={base}
              suffix={suffix}
              showCategory={false}
              label="Related articles"
            />
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
