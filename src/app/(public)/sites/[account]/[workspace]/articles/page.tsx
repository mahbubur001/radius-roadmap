import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import {
  ArticleList,
  ArticleSearch,
  CategoryGrid,
  MostRead,
} from "@/components/public/public-articles";
import { Skeleton } from "@/components/ui/skeleton";
import { wsPath } from "@/lib/public-path";
import {
  loadArticleSearch,
  loadKnowledgeBase,
  loadSiteForRequest,
  loadWorkspace,
} from "../../data";
import { SiteShell } from "../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/articles">;

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

async function load(props: Props) {
  const { account, workspace } = await props.params;
  const query = await props.searchParams;
  const site = await loadSiteForRequest(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.articles) return null;
  const q = first(query.q)?.trim().slice(0, 100) || undefined;
  const [kb, results] = await Promise.all([
    q ? null : loadKnowledgeBase(site.accountId, ws.id),
    q ? loadArticleSearch(site.accountId, ws.id, q) : null,
  ]);
  return {
    origin: site.publicBase,
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
    alternates: { canonical: `${origin}${wsPath(ws)}/articles` },
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
  const base = `${site.prefix}${wsPath(ws)}/articles`;
  const suffix = embed ? "?embed=1" : "";
  return (
    <SiteShell
      account={site.slug}
      workspace={ws}
      active="articles"
      embed={embed}
    >
      <PageView />
      <div className={embed ? "pt-1" : "pt-[30px] pb-[22px] md:pt-16 md:pb-10"}>
        {embed ? null : (
          <>
            <div className="font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase">
              Help centre
              {kb
                ? ` · ${kb.total} ${kb.total === 1 ? "article" : "articles"}`
                : ""}
            </div>
            <h1 className="mt-2.5 font-t-display text-[38px] leading-none font-bold tracking-[-0.035em] md:mt-3.5 md:text-[clamp(36px,4.6vw,58px)]">
              How can we help?
            </h1>
          </>
        )}
        <ArticleSearch
          base={base}
          query={q ?? ""}
          embed={embed}
          className={embed ? "" : "mt-4 md:mt-6"}
        />
      </div>
      {results ? (
        <section className="pb-16">
          <h2 className="mb-2.5 font-t-mono text-[11px] font-bold tracking-[0.14em] text-ink3 uppercase">
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
          {kb.categories.length ? (
            <CategoryGrid
              categories={kb.categories}
              base={base}
              suffix={suffix}
            />
          ) : null}
          {kb.mostRead.length ? (
            <MostRead articles={kb.mostRead} base={base} suffix={suffix} />
          ) : null}
        </>
      ) : null}
    </SiteShell>
  );
}
