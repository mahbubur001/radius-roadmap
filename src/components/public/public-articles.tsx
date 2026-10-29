import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import type { PublicArticleSummary } from "@/server/services/public-articles";

// Shared pieces of the public Articles pages (doc 25 step 3): the centred
// search, article lists and the category grid.

export function articleDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** LoopedIn's centred search box (doc 15 §6). A plain GET form. */
export function ArticleSearch({
  base,
  query,
  embed,
}: {
  /** e.g. "/acme/product/articles" */
  base: string;
  query: string;
  embed: boolean;
}) {
  return (
    <search className="mx-auto w-full max-w-xl">
      <form action={base} className="relative">
        {embed ? <input type="hidden" name="embed" value="1" /> : null}
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          aria-label="Search articles"
          placeholder="Search articles…"
          className="h-12 w-full rounded-full border bg-card pr-4 pl-12 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </form>
    </search>
  );
}

/** A list of articles linking to their pages. */
export function ArticleList({
  articles,
  base,
  suffix,
  showCategory = true,
  label,
}: {
  articles: PublicArticleSummary[];
  base: string;
  /** "?embed=1" inside the embed, else "". */
  suffix: string;
  showCategory?: boolean;
  label: string;
}) {
  return (
    <ul
      aria-label={label}
      className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card"
    >
      {articles.map((a) => (
        <li key={a.id}>
          <Link
            href={`${base}/${a.slug}${suffix}`}
            className="group flex items-center gap-4 px-5 py-4 hover:bg-muted/40"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-medium group-hover:text-primary">
                {a.title}
              </span>
              {a.excerpt ? (
                <span className="line-clamp-2 text-sm text-muted-foreground">
                  {a.excerpt}
                </span>
              ) : null}
              {showCategory && a.category ? (
                <span className="text-xs text-muted-foreground">
                  {a.category.icon} {a.category.name}
                </span>
              ) : null}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type PublicCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  articles: number;
};

/** Category cards with their article counts. */
export function CategoryGrid({
  categories,
  base,
  suffix,
}: {
  categories: PublicCategory[];
  base: string;
  suffix: string;
}) {
  return (
    <ul
      aria-label="Categories"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {categories.map((c) => (
        <li key={c.id}>
          <Link
            href={`${base}/category/${c.slug}${suffix}`}
            className="flex h-full flex-col gap-2 rounded-lg border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-muted/30"
          >
            <span className="text-2xl" aria-hidden>
              {c.icon}
            </span>
            <span className="font-semibold">{c.name}</span>
            {c.description ? (
              <span className="text-sm text-muted-foreground">
                {c.description}
              </span>
            ) : null}
            <span className="mt-auto pt-2 text-xs text-muted-foreground">
              {c.articles} {c.articles === 1 ? "article" : "articles"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
