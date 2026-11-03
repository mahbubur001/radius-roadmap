import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import {
  ArticleList,
  ArticleSearch,
  BackLink,
} from "@/components/public/public-articles";
import { Chip } from "@/components/public/public-board";
import { Skeleton } from "@/components/ui/skeleton";
import { wsPath } from "@/lib/public-path";
import {
  loadArticleCategory,
  loadSiteForRequest,
  loadWorkspace,
} from "../../../../data";
import { SiteShell } from "../../../../site-shell";

type Props =
  PageProps<"/sites/[account]/[workspace]/articles/category/[category]">;

async function load(props: Props) {
  const { account, workspace, category } = await props.params;
  const query = await props.searchParams;
  const site = await loadSiteForRequest(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.articles) return null;
  const found = await loadArticleCategory(site.accountId, ws.id, category);
  if (!found) return null;
  return {
    origin: site.publicBase,
    site,
    ws,
    data: found,
    embed: query.embed === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, embed } = data;
  const { category } = data.data;
  const indexable = ws.settings.indexPublicPages !== false && !embed;
  return {
    title: { absolute: `${category.name} · ${ws.name} help` },
    description:
      category.description || `${category.name} articles for ${ws.name}.`,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: {
      canonical: `${origin}${wsPath(ws)}/articles/category/${category.slug}`,
    },
  };
}

export default function PublicArticleCategoryPage(props: Props) {
  return (
    <Suspense
      fallback={<Skeleton className="mx-auto mt-10 h-96 w-full max-w-4xl" />}
    >
      <Category {...props} />
    </Suspense>
  );
}

async function Category(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, embed } = data;
  const { category, categories, articles } = data.data;
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
      <div className="pt-6 pb-16 md:pt-12">
        <BackLink href={`${base}${suffix}`}>Help centre</BackLink>
        <div className="mt-6 font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase">
          {articles.length} {articles.length === 1 ? "article" : "articles"}
        </div>
        <h1 className="mt-2.5 font-t-display text-[34px] leading-none font-bold tracking-[-0.03em] md:text-[44px]">
          {category.name}
        </h1>
        {category.description ? (
          <p className="mt-3 max-w-2xl text-[15.5px] text-muted-foreground md:text-[17px]">
            {category.description}
          </p>
        ) : null}
        <div className="my-6 flex flex-col gap-3.5 md:flex-row md:items-center">
          <ArticleSearch
            base={base}
            query=""
            embed={embed}
            className="flex-1"
          />
        </div>
        <nav
          aria-label="Categories"
          className="-mx-[18px] mb-6 flex gap-2.5 overflow-x-auto px-[18px] [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
        >
          {categories.map((c) => (
            <Chip
              key={c.id}
              on={c.id === category.id}
              href={`${base}/category/${c.slug}${suffix}`}
            >
              {c.name}
              <span className="font-t-mono text-xs opacity-60">
                {c.articles}
              </span>
            </Chip>
          ))}
        </nav>
        <ArticleList
          articles={articles}
          base={base}
          suffix={suffix}
          showCategory={false}
          label={`${category.name} articles`}
        />
      </div>
    </SiteShell>
  );
}
