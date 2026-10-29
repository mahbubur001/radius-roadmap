import { Map as MapIcon, Pin } from "lucide-react";
import type { PublicPost } from "@/server/services/public-updates";
import { ReactionBar } from "./reaction-bar";

export type PublicPostView = PublicPost & {
  html?: string | null;
  cards?: { slug: string; title: string }[];
};

export function postDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function CategoryChip({
  category,
}: {
  category: NonNullable<PublicPost["category"]>;
}) {
  return (
    <span className="flex w-fit items-center gap-1.5 rounded border px-2 py-0.5 text-xs">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      {category.name}
    </span>
  );
}

/** One post: cover, meta, body and the roadmap cards it shipped. */
export function UpdateDetail({
  post,
  roadmapBase,
}: {
  post: PublicPostView;
  /** e.g. "/acme/product/roadmap"; null when the roadmap isn't shown. */
  roadmapBase: string | null;
}) {
  return (
    <article className="flex flex-col">
      {post.cover ? (
        // biome-ignore lint/performance/noImgElement: user upload, any size
        <img
          src={post.cover}
          alt=""
          className="aspect-[16/9] w-full border-b object-cover"
        />
      ) : null}
      <div className="flex flex-col gap-4 px-6 pt-6 pb-8">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {post.category ? <CategoryChip category={post.category} /> : null}
          <time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time>
          {post.pinned ? (
            <span className="flex items-center gap-1">
              <Pin className="size-3.5" />
              Pinned
            </span>
          ) : null}
        </div>
        <h1 className="pr-8 text-2xl font-semibold tracking-tight">
          {post.title}
        </h1>
        {post.html ? (
          <div
            className="rich-text"
            // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
        ) : post.excerpt ? (
          <p className="whitespace-pre-line text-muted-foreground">
            {post.excerpt}
          </p>
        ) : null}
        <ReactionBar postId={post.id} counts={post.reactions} />
        {roadmapBase && post.cards?.length ? (
          <section className="flex flex-col gap-2 rounded-md border bg-muted/40 p-4">
            <h2 className="text-sm font-medium">Shipped from the roadmap</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {post.cards.map((c) => (
                <li key={c.slug}>
                  <a
                    href={`${roadmapBase}/${c.slug}`}
                    className="flex items-center gap-2 text-primary underline"
                  >
                    <MapIcon className="size-4" />
                    {c.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}
