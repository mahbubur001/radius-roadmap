import { Rss, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicPost } from "@/server/services/public-updates";
import { Chip } from "./public-board";
import { SubscribeBox } from "./subscribe-box";
import { type PublicPostView, UpdateEntry } from "./update-detail";

/**
 * Public Updates as a journal (doc 32): eyebrow and title, the subscribe
 * pill, search and category chips, then entries newest first (pinned on
 * top). Titles link to the crawlable post pages.
 */
export function PublicUpdates({
  base,
  posts,
  categories,
  query,
  category,
  embed,
  roadmapBase,
  justSubscribed,
  reactions,
}: {
  /** e.g. "/acme/product/updates" */
  base: string;
  posts: (PublicPost & Pick<PublicPostView, "cards">)[];
  categories: { id: string; name: string; color: string }[];
  query: string;
  category: string;
  embed: boolean;
  roadmapBase: string | null;
  /** Arrived from the confirmation email link. */
  justSubscribed: boolean;
  /** Emoji reactions are in the account's plan (doc 26 P7). */
  reactions: boolean;
}) {
  const suffix = embed ? "?embed=1" : "";
  function categoryHref(id: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (id) params.set("category", id);
    if (embed) params.set("embed", "1");
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  return (
    <div
      className={cn(
        "mx-auto max-w-[980px] pb-10 md:pb-16",
        embed ? "pt-1" : "pt-[26px] md:pt-12",
      )}
    >
      {embed ? null : (
        <>
          <div className="font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase">
            Updates
          </div>
          <h1 className="mt-2.5 mb-4 font-t-display text-[34px] leading-none font-bold tracking-[-0.03em] md:mb-6 md:text-[44px]">
            What we shipped
          </h1>
        </>
      )}
      <SubscribeBox justConfirmed={justSubscribed} />

      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <search className="w-full md:w-[280px]">
          <form
            action={base}
            aria-label="Filter updates"
            className="flex h-10 items-center gap-2 rounded-full bg-sheet px-3.5 text-ink3 ring-1 ring-border focus-within:ring-2 focus-within:ring-ring"
          >
            <Search strokeWidth={1.8} className="size-4 shrink-0" />
            {category ? (
              <input type="hidden" name="category" value={category} />
            ) : null}
            {embed ? <input type="hidden" name="embed" value="1" /> : null}
            <input
              type="search"
              name="q"
              defaultValue={query}
              aria-label="Search updates"
              placeholder="Search updates"
              className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-ink3"
            />
          </form>
        </search>
        {categories.length ? (
          <nav
            aria-label="Categories"
            className="-mx-[18px] flex gap-2.5 overflow-x-auto px-[18px] [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
          >
            <Chip on={!category} href={categoryHref("")}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} on={c.id === category} href={categoryHref(c.id)}>
                {c.name}
              </Chip>
            ))}
          </nav>
        ) : null}
        {embed ? null : (
          <a
            href={`${base}/feed.xml`}
            title="RSS feed"
            className="ml-auto hidden items-center gap-1.5 font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase hover:text-foreground md:flex"
          >
            <Rss strokeWidth={1.8} className="size-4" />
            RSS
          </a>
        )}
      </div>

      {posts.length ? (
        posts.map((post) => (
          <UpdateEntry
            key={post.id}
            post={post}
            href={`${base}/${post.slug}${suffix}`}
            roadmapBase={roadmapBase}
            reactions={reactions}
          />
        ))
      ) : (
        <p className="border-t py-16 text-center text-ink3">
          {query || category ? "No updates match." : "No updates yet."}
        </p>
      )}
    </div>
  );
}
