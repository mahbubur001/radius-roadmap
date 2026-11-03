import { ArrowRight } from "lucide-react";
import type { PublicPost, ShippedCard } from "@/server/services/public-updates";
import { ReactionBar } from "./reaction-bar";

export type PublicPostView = PublicPost & {
  html?: string | null;
  cards?: ShippedCard[];
};

export function postDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * One journal entry (doc 32): the big date in the margin; kind, title,
 * cover, body, "Shipped from the roadmap" and reactions. The Updates list
 * shows the excerpt with a link to the post; the post page the full body.
 */
export function UpdateEntry({
  post,
  roadmapBase,
  reactions,
  href,
}: {
  post: PublicPostView;
  /** e.g. "/acme/product/roadmap"; null when the roadmap isn't shown. */
  roadmapBase: string | null;
  /** Emoji reactions are in the account's plan (doc 26 P7). */
  reactions: boolean;
  /** In the list: the post page (title links there); null on the page. */
  href: string | null;
}) {
  const date = new Date(post.publishedAt);
  const kind = [post.category?.name, post.pinned ? "Pinned" : null]
    .filter(Boolean)
    .join(" · ");
  const cards = roadmapBase ? (post.cards ?? []) : [];
  const asked = cards.reduce((n, c) => n + (c.votes ?? 0), 0);
  const Title = href ? "h2" : "h1";
  return (
    <article className="grid grid-cols-1 gap-2.5 border-t py-6 md:grid-cols-[120px_minmax(0,1fr)] md:gap-8 md:py-8">
      <time
        dateTime={post.publishedAt}
        className="flex items-baseline gap-2 self-start font-t-mono md:sticky md:top-[92px] md:block"
      >
        <b className="text-[30px] leading-[0.9] tracking-[-0.05em] md:block md:text-[52px]">
          {String(date.getDate()).padStart(2, "0")}
        </b>
        <span className="text-[13px] tracking-[0.14em] text-ink3 uppercase">
          {date.toLocaleDateString("en", { month: "short", year: "numeric" })}
        </span>
      </time>
      <div className="min-w-0">
        {kind ? (
          <div className="font-t-mono text-[11px] font-bold tracking-[0.14em] text-primary uppercase">
            {kind}
          </div>
        ) : null}
        <Title className="mt-2.5 mb-3.5 font-t-display text-[25px] leading-[1.1] font-bold tracking-[-0.025em] [overflow-wrap:anywhere] md:text-[32px]">
          {href ? (
            <a href={href} className="hover:text-primary">
              {post.title}
            </a>
          ) : (
            post.title
          )}
        </Title>
        {post.cover ? (
          // biome-ignore lint/performance/noImgElement: user upload, any size
          <img
            src={post.cover}
            alt=""
            className="mb-[18px] h-[170px] w-full rounded-[18px] object-cover md:h-[260px]"
          />
        ) : null}
        {!href && post.html ? (
          <div
            className="rich-text text-base leading-[1.65] text-muted-foreground"
            // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
        ) : post.excerpt ? (
          <p className="mb-4 text-base leading-[1.65] whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">
            {post.excerpt}
            {href && post.excerpt.length >= 280 ? "…" : ""}
          </p>
        ) : null}
        {href && post.excerpt && post.excerpt.length >= 280 ? (
          <a
            href={href}
            className="mb-4 inline-flex items-center gap-1.5 font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase hover:text-foreground"
          >
            Read the post
            <ArrowRight strokeWidth={1.8} className="size-3.5" />
          </a>
        ) : null}
        {cards.length ? (
          <section
            aria-label="Shipped from the roadmap"
            className="mt-4 overflow-hidden rounded-[14px] ring-1 ring-border"
          >
            <div className="flex justify-between gap-3 bg-paper px-3.5 py-2.5 font-t-mono text-[11px] font-bold tracking-[0.12em] text-ink3 uppercase">
              <span>Shipped from the roadmap</span>
              {asked ? (
                <span>
                  {asked} {asked === 1 ? "person" : "people"} asked
                </span>
              ) : null}
            </div>
            {cards.map((c) => (
              <a
                key={c.slug}
                href={`${roadmapBase}/${c.slug}`}
                className="flex items-center gap-3 border-t px-3.5 py-3 font-medium hover:text-primary"
              >
                <span className="size-[9px] shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {c.votes !== null ? (
                  <b className="font-t-mono text-[13px] font-bold">{c.votes}</b>
                ) : null}
              </a>
            ))}
          </section>
        ) : null}
        {reactions ? (
          <ReactionBar
            postId={post.id}
            counts={post.reactions}
            className="mt-4"
          />
        ) : null}
      </div>
    </article>
  );
}
