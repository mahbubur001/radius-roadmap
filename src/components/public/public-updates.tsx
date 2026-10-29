"use client";

import { Pin, Rss, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PublicPost } from "@/server/services/public-updates";
import { SubscribeBox } from "./subscribe-box";
import {
  CategoryChip,
  type PublicPostView,
  postDate,
  UpdateDetail,
} from "./update-detail";

/**
 * Public Updates (doc 22 §2.4, doc 23 step 3): search + Categories filter,
 * posts newest first (pinned on top). Titles are real links (crawlable post
 * pages); a plain click opens the post in a drawer.
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
}: {
  /** e.g. "/acme/product/updates" */
  base: string;
  posts: PublicPost[];
  categories: { id: string; name: string; color: string }[];
  query: string;
  category: string;
  embed: boolean;
  roadmapBase: string | null;
  /** Arrived from the confirmation email link. */
  justSubscribed: boolean;
}) {
  const [open, setOpen] = useState<PublicPostView | null>(null);

  useEffect(() => {
    const onPop = () => setOpen(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function href(post: PublicPost) {
    return `${base}/${post.slug}${embed ? "?embed=1" : ""}`;
  }

  async function openPost(post: PublicPost) {
    setOpen(post);
    window.history.pushState({ post: post.id }, "", href(post));
  }

  function close() {
    setOpen(null);
    if (window.history.state?.post) window.history.back();
  }

  return (
    <div className="flex flex-col gap-6">
      <search className="flex flex-wrap items-center justify-end gap-2 border-b pb-6">
        <form
          action={base}
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
          aria-label="Filter updates"
        >
          {embed ? <input type="hidden" name="embed" value="1" /> : null}
          <div className="relative min-w-56 flex-1 sm:w-72 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={query}
              aria-label="Search updates"
              placeholder="Search…"
              className="h-10 pl-9"
            />
          </div>
          <select
            name="category"
            defaultValue={category}
            aria-label="Categories"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-10 cursor-pointer rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </form>
        {embed ? null : (
          <a
            href={`${base}/feed.xml`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            title="RSS feed"
          >
            <Rss className="size-4" />
            RSS
          </a>
        )}
      </search>

      <div className="mx-auto w-full max-w-3xl">
        <SubscribeBox justConfirmed={justSubscribed} />
      </div>

      {posts.length ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {posts.map((post) => (
            <article
              key={post.id}
              className="relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs transition-colors hover:border-ring/50"
            >
              {post.cover ? (
                // biome-ignore lint/performance/noImgElement: user upload, any size
                <img
                  src={post.cover}
                  alt=""
                  className="aspect-[16/9] w-full border-b object-cover"
                />
              ) : null}
              <div className="flex flex-col gap-2 px-6 py-5">
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {post.category ? (
                    <CategoryChip category={post.category} />
                  ) : null}
                  <time dateTime={post.publishedAt}>
                    {postDate(post.publishedAt)}
                  </time>
                  {post.pinned ? (
                    <span className="flex items-center gap-1">
                      <Pin className="size-3.5" />
                      Pinned
                    </span>
                  ) : null}
                </div>
                <h2 className="text-xl font-semibold">
                  <a
                    href={href(post)}
                    onClick={(e) => {
                      if (
                        e.metaKey ||
                        e.ctrlKey ||
                        e.shiftKey ||
                        e.button !== 0
                      ) {
                        return;
                      }
                      e.preventDefault();
                      void openPost(post);
                    }}
                    className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                  >
                    {post.title}
                  </a>
                </h2>
                {post.excerpt ? (
                  <p className="line-clamp-3 text-muted-foreground">
                    {post.excerpt}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {query || category ? "No updates match." : "No updates yet."}
        </p>
      )}

      <Sheet open={!!open} onOpenChange={(next) => !next && close()}>
        <SheetContent className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{open?.title}</SheetTitle>
            <SheetDescription>Update</SheetDescription>
          </SheetHeader>
          {open ? (
            <PostDrawerBody post={open} base={base} roadmapBase={roadmapBase} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The list only has excerpts; the drawer loads the full post page's data. */
function PostDrawerBody({
  post,
  base,
  roadmapBase,
}: {
  post: PublicPostView;
  base: string;
  roadmapBase: string | null;
}) {
  return (
    <div className="flex flex-col">
      <UpdateDetail post={post} roadmapBase={roadmapBase} />
      <a
        href={`${base}/${post.slug}`}
        className="mx-6 mb-6 w-fit text-sm text-primary underline"
      >
        Read the full post
      </a>
    </div>
  );
}
