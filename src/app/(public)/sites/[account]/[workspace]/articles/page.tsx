import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import {
  ArticleList,
  ArticleSearch,
  CategoryGrid,
} from "@/components/public/public-articles";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadArticleSearch,
  loadKnowledgeBase,
  loadSite,
  loadWorkspace,
  siteUrl,
} from "../../data";
import { SiteShell } from "../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/articles">;

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

async function load(props: Props) {
  const { account, workspace } = await props.params;
  const query = await props.searchParams;
  const site = await loadSite(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.articles) return null;
  const q = first(query.q)?.trim().slice(0, 100) || undefined;
  const [kb, results] = await Promise.all([
    q ? null : loadKnowledgeBase(site.accountId, ws.id),
    q ? loadArticleSearch(site.accountId, ws.id, q) : null,
  ]);
  return {
    origin: siteUrl(site.slug),
    site,
    ws,
    kb,
    results,
    q,
    embed: first(query.embed) === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, embed, q } = data;
  const indexable = ws.settings.indexPublicPages !== false && !embed && !q;
  return {
    title: { absolute: `Help articles · ${ws.name}` },
    description: `Guides and answers for ${ws.name}.`,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: `${origin}/${ws.slug}/articles` },
  };
}

export default function PublicArticlesPage(props: Props) {
  return (
    <Suspense
      fallback={<Skeleton className="mx-auto mt-10 h-96 w-full max-w-4xl" />}
    >
      <Articles {...props} />
    </Suspense>
  );
}

async function Articles(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, kb, results, q, embed } = data;
  const base = `/${site.slug}/${ws.slug}/articles`;
  const suffix = embed ? "?embed=1" : "";
  return (
    <SiteShell
      account={site.slug}
      workspace={ws}
      active="articles"
      embed={embed}
    >
      <PageView />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <div className="flex flex-col items-center gap-5 pt-4 text-center">
          {embed ? null : (
            <h1 className="text-3xl font-semibold tracking-tight">
              How can we help?
            </h1>
          )}
          <ArticleSearch base={base} query={q ?? ""} embed={embed} />
        </div>

        {results ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              {results.length
                ? `${results.length} ${results.length === 1 ? "result" : "results"} for “${q}”`
                : `No articles match “${q}”.`}
            </h2>
            {results.length ? (
              <ArticleList
                articles={results}
                base={base}
                suffix={suffix}
                label="Search results"
              />
            ) : null}
          </section>
        ) : kb ? (
          <>
            {kb.featured.length ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Featured</h2>
                <ArticleList
                  articles={kb.featured}
                  base={base}
                  suffix={suffix}
                  label="Featured articles"
                />
              </section>
            ) : null}
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Recent articles</h2>
              <ArticleList
                articles={kb.recent}
                base={base}
                suffix={suffix}
                label="Recent articles"
              />
            </section>
            {kb.categories.length ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Categories</h2>
                <CategoryGrid
                  categories={kb.categories}
                  base={base}
                  suffix={suffix}
                />
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </SiteShell>
  );
}
