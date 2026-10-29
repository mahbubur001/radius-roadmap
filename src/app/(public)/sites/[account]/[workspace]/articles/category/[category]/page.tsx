import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import {
  ArticleList,
  ArticleSearch,
} from "@/components/public/public-articles";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadArticleCategory,
  loadSite,
  loadWorkspace,
  siteUrl,
} from "../../../../data";
import { SiteShell } from "../../../../site-shell";

type Props =
  PageProps<"/sites/[account]/[workspace]/articles/category/[category]">;

async function load(props: Props) {
  const { account, workspace, category } = await props.params;
  const query = await props.searchParams;
  const site = await loadSite(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.articles) return null;
  const found = await loadArticleCategory(site.accountId, ws.id, category);
  if (!found) return null;
  return {
    origin: siteUrl(site.slug),
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
      canonical: `${origin}/${ws.slug}/articles/category/${category.slug}`,
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <ArticleSearch base={base} query="" embed={embed} />
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <nav
            aria-label="Categories"
            className="flex shrink-0 flex-col gap-0.5 text-sm md:w-56"
          >
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`${base}/category/${c.slug}${suffix}`}
                aria-current={c.id === category.id ? "page" : undefined}
                className={
                  c.id === category.id
                    ? "flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-medium"
                    : "flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }
              >
                <span aria-hidden>{c.icon}</span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs">{c.articles}</span>
              </Link>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 text-sm text-muted-foreground"
            >
              <Link href={`${base}${suffix}`} className="hover:text-foreground">
                Articles
              </Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground">{category.name}</span>
            </nav>
            <div className="flex flex-col gap-1">
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <span aria-hidden>{category.icon}</span>
                {category.name}
              </h1>
              {category.description ? (
                <p className="text-muted-foreground">{category.description}</p>
              ) : null}
            </div>
            <ArticleList
              articles={articles}
              base={base}
              suffix={suffix}
              showCategory={false}
              label={`${category.name} articles`}
            />
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
