import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PublicArticleSummary } from "@/server/services/public-articles";

// Shared pieces of the public Help pages (doc 32 "Transit", doc 25): the big
// search, the numbered category index, "Most read" and article rows.

export function articleDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** The big search (`.bigsearch`). A plain GET form. */
export function ArticleSearch({
  base,
  query,
  embed,
  className,
}: {
  /** e.g. "/acme/product/articles" */
  base: string;
  query: string;
  embed: boolean;
  className?: string;
}) {
  return (
    <search className={cn("block max-w-[720px]", className)}>
      <form
        action={base}
        className="flex h-[54px] items-center gap-3.5 rounded-[18px] bg-sheet px-[22px] text-ink3 shadow-[0_0_0_1px_var(--border),0_20px_40px_-30px_rgba(0,0,0,.3)] focus-within:shadow-[0_0_0_2px_var(--ring),0_20px_40px_-30px_rgba(0,0,0,.3)] md:h-16"
      >
        {embed ? <input type="hidden" name="embed" value="1" /> : null}
        <Search strokeWidth={1.8} className="size-5 shrink-0" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          aria-label="Search articles"
          placeholder="Search for answers…"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-ink3 md:text-lg"
        />
      </form>
    </search>
  );
}

/** Article rows under a heavy rule, like the ideas ledger. */
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
    <ul aria-label={label} className="border-t-2 border-foreground">
      {articles.map((a) => (
        <li key={a.id} className="border-b">
          <Link
            href={`${base}/${a.slug}${suffix}`}
            className="group flex items-center gap-4 px-1 py-[18px]"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-t-display text-[17px] leading-[1.3] font-semibold tracking-[-0.01em] [overflow-wrap:anywhere] group-hover:text-primary">
                {a.title}
              </span>
              {a.excerpt ? (
                <span className="mt-[3px] line-clamp-2 block text-[13.5px] text-muted-foreground">
                  {a.excerpt}
                </span>
              ) : null}
              {showCategory && a.category ? (
                <span className="mt-1.5 block font-t-mono text-[11px] font-bold tracking-[0.12em] text-ink3 uppercase">
                  {a.category.name}
                </span>
              ) : null}
            </span>
            <ArrowRight
              strokeWidth={1.8}
              className="size-4 shrink-0 text-ink3 group-hover:text-foreground"
            />
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

/** The numbered category index (`.index`). */
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
      className="mb-12 grid grid-cols-1 border-t-2 border-foreground md:grid-cols-3 md:gap-x-9"
    >
      {categories.map((c, i) => (
        <li key={c.id} className="border-b">
          <Link
            href={`${base}/category/${c.slug}${suffix}`}
            className="group grid grid-cols-[44px_1fr_auto] items-baseline gap-2.5 py-5"
          >
            <span className="font-t-mono text-[13px] font-bold text-ink3">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-t-display text-[19px] font-semibold tracking-[-0.01em] group-hover:text-primary">
              {c.name}
            </span>
            <span className="font-t-mono text-xs font-semibold text-ink3">
              {c.articles}
            </span>
            {c.description ? (
              <span className="col-start-2 text-[13.5px] text-muted-foreground">
                {c.description}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Most read" (`.pop`): two columns of article links with an arrow. */
export function MostRead({
  articles,
  base,
  suffix,
}: {
  articles: PublicArticleSummary[];
  base: string;
  suffix: string;
}) {
  return (
    <section>
      <h2 className="mb-2.5 font-t-mono text-[11px] font-bold tracking-[0.14em] text-ink3 uppercase">
        Most read
      </h2>
      <ul
        aria-label="Most read"
        className="grid grid-cols-1 gap-3 pb-16 md:grid-cols-2"
      >
        {articles.map((a) => (
          <li key={a.id}>
            <Link
              href={`${base}/${a.slug}${suffix}`}
              className="flex items-center gap-3 rounded-[14px] bg-sheet px-[18px] py-4 font-medium ring-1 ring-border hover:ring-rule2"
            >
              <span className="min-w-0 flex-1 truncate">{a.title}</span>
              <ArrowRight strokeWidth={1.8} className="size-4 text-ink3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Mono back link at the top of the category and article pages. */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex w-fit items-center gap-1.5 font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase hover:text-foreground"
    >
      <ArrowRight strokeWidth={1.8} className="size-4 rotate-180" />
      {children}
    </Link>
  );
}
