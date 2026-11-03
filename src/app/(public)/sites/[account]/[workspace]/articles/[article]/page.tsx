import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleRating } from "@/components/public/article-rating";
import { PageView } from "@/components/public/page-view";
import {
  ArticleList,
  articleDate,
  BackLink,
} from "@/components/public/public-articles";
import { Skeleton } from "@/components/ui/skeleton";
import { wsPath } from "@/lib/public-path";
import { loadArticle, loadSiteForRequest, loadWorkspace } from "../../../data";
import { SiteShell } from "../../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/articles/[article]">;

async function load(props: Props) {
  const { account, workspace, article } = await props.params;
  const query = await props.searchParams;
  const site = await loadSiteForRequest(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.articles) return null;
  const found = await loadArticle(site.accountId, ws.id, article);
  if (!found) return null;
  return {
    origin: site.publicBase,
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
    alternates: {
      canonical: `${origin}${wsPath(ws)}/articles/${article.slug}`,
    },
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
  const base = `${site.prefix}${wsPath(ws)}/articles`;
  const suffix = embed ? "?embed=1" : "";
  return (
    <SiteShell
      account={site.slug}
      workspace={ws}
      active="articles"
      embed={embed}
    >
      <PageView articleId={article.id} />
      <div className="mx-auto max-w-3xl pt-6 pb-16 md:pt-12">
        <BackLink
          href={
            article.category
              ? `${base}/category/${article.category.slug}${suffix}`
              : `${base}${suffix}`
          }
        >
          {article.category?.name ?? "Help centre"}
        </BackLink>
        <article className="mt-5 overflow-hidden rounded-[22px] bg-sheet px-5 pt-[26px] pb-6 ring-1 ring-border md:px-10 md:pt-10 md:pb-8">
          <h1 className="font-t-display text-[30px] leading-[1.1] font-bold tracking-[-0.03em] [overflow-wrap:anywhere] md:text-[40px]">
            {article.title}
          </h1>
          <p className="mt-3 mb-6 font-t-mono text-[12.5px] font-medium text-ink3">
            Updated{" "}
            <time dateTime={article.updatedAt}>
              {articleDate(article.updatedAt)}
            </time>
          </p>
          {article.html ? (
            <div
              className="rich-text text-base leading-[1.7]"
              // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
              dangerouslySetInnerHTML={{ __html: article.html }}
            />
          ) : null}
          <ArticleRating articleId={article.id} />
        </article>
        {article.related.length ? (
          <section className="mt-10">
            <h2 className="mb-2.5 font-t-mono text-[11px] font-bold tracking-[0.14em] text-ink3 uppercase">
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
