"use client";

import { Plus, Search, Shapes, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createArticleAction,
  moveArticleAction,
} from "@/app/(dashboard)/_actions/articles";
import { SortableList } from "@/components/dashboard/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArticleTab } from "@/lib/schemas/articles";
import { cn } from "@/lib/utils";
import type { ArticleRow } from "@/server/services/articles";
import {
  ArticleCategoriesDialog,
  type ArticleCategoryOption,
} from "./categories-dialog";

const TABS: { key: ArticleTab; label: string }[] = [
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
];

function formatDate(value: Date | string | null) {
  return value
    ? new Date(value).toLocaleDateString("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
}

type Stats = {
  published: number;
  likes: number;
  neutrals: number;
  dislikes: number;
  views: number;
};

/** Admin Articles (doc 25 step 2): tiles, categories, list. */
export function ArticlesView({
  workspace,
  canManage,
  tab,
  query,
  category,
  counts,
  stats,
  categories: initialCategories,
  items: initialItems,
}: {
  workspace: string;
  canManage: boolean;
  tab: ArticleTab;
  query: string;
  /** A category id, "none", or "" for all. */
  category: string;
  counts: Partial<Record<ArticleTab, number>>;
  stats: Stats;
  categories: ArticleCategoryOption[];
  items: ArticleRow[];
}) {
  const router = useRouter();
  const base = `/dashboard/${workspace}/articles`;
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  useEffect(() => setCategories(initialCategories), [initialCategories]);
  useEffect(() => setItems(initialItems), [initialItems]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Only a single category's list (unsearched) has a meaningful order to drag.
  const sortable = !!category && !query;

  function href(next: { tab?: ArticleTab; category?: string }) {
    const params = new URLSearchParams();
    const t = next.tab ?? tab;
    const c = next.category ?? category;
    if (t !== "published") params.set("tab", t);
    if (c) params.set("category", c);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  async function newArticle() {
    setCreating(true);
    const result = await createArticleAction({
      workspace,
      categoryId: category && category !== "none" ? category : undefined,
    });
    setCreating(false);
    if (!result.ok) return toast.error(result.error);
    router.push(`${base}/${result.data.id}`);
  }

  async function move(
    next: ArticleRow[],
    m: { id: string; prevId: string | null; nextId: string | null },
  ) {
    const before = items;
    setItems(next);
    const result = await moveArticleAction({ workspace, ...m });
    if (!result.ok) {
      setItems(before);
      toast.error(result.error);
    }
  }

  const row = (a: ArticleRow, handle?: React.ReactNode) => (
    <div className="flex items-center gap-2 px-3 py-3 hover:bg-muted/40">
      {handle}
      <Link
        href={`${base}/${a.id}`}
        className="flex min-w-0 flex-1 flex-col gap-1 px-2"
      >
        <span className="flex items-center gap-2 font-medium">
          {a.featured ? (
            <Star
              className="size-4 shrink-0 fill-current text-amber-500"
              aria-label="Featured"
            />
          ) : null}
          <span className="truncate">{a.title}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {a.categoryIcon ?? "📄"} {a.categoryName ?? "Uncategorised"}
          </span>
          {a.isPublic ? null : <Badge variant="outline">Private</Badge>}
          <span>
            {a.status === "published"
              ? formatDate(a.publishedAt)
              : `Edited ${formatDate(a.updatedAt)}`}
          </span>
        </span>
      </Link>
      <Helpful likes={a.likes} neutrals={a.neutrals} dislikes={a.dislikes} />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Articles</h1>
        <p className="text-sm text-muted-foreground">
          Your knowledge base. Published public articles appear under Articles
          on your public site.
        </p>
      </div>

      <div className="grid overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-5 [&>*+*]:border-t sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
        <Stat label="Published" value={stats.published} />
        <Stat
          label="Rated helpful"
          value={
            stats.likes + stats.neutrals + stats.dislikes
              ? `${Math.round((stats.likes / (stats.likes + stats.neutrals + stats.dislikes)) * 100)}%`
              : "–"
          }
        />
        <Stat label="Likes" value={stats.likes} />
        <Stat label="Dislikes" value={stats.dislikes} />
        <Stat label="Views (30 days)" value={stats.views} />
      </div>

      <nav className="flex gap-1 border-b text-sm" aria-label="Article status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href({ tab: t.key })}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2",
              t.key === tab
                ? "border-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} ({counts[t.key] ?? 0})
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={newArticle} disabled={creating}>
          <Plus />
          New article
        </Button>
        <form
          action={base}
          className="ml-auto flex items-center gap-2"
          aria-label="Search articles"
        >
          {tab !== "published" ? (
            <input type="hidden" name="tab" value={tab} />
          ) : null}
          {category ? (
            <input type="hidden" name="category" value={category} />
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={query}
              aria-label="Search articles"
              placeholder="Search…"
              className="w-56 pl-8"
            />
          </div>
        </form>
        {canManage ? (
          <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
            <Shapes />
            Categories
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <nav
          aria-label="Categories"
          className="flex shrink-0 flex-col gap-0.5 text-sm md:w-60"
        >
          <CategoryLink
            href={href({ category: "" })}
            active={!category}
            label="All articles"
            icon="📚"
          />
          {categories.map((c) => (
            <CategoryLink
              key={c.id}
              href={href({ category: c.id })}
              active={category === c.id}
              label={c.name}
              icon={c.icon}
              count={c.articles}
            />
          ))}
          <CategoryLink
            href={href({ category: "none" })}
            active={category === "none"}
            label="Uncategorised"
            icon="📄"
          />
        </nav>

        <div className="min-w-0 flex-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
              <p className="font-medium">
                {query
                  ? "No articles match."
                  : tab === "draft"
                    ? "No drafts."
                    : "Nothing published yet."}
              </p>
              <p className="text-sm text-muted-foreground">
                {categories.length || !canManage
                  ? "Write an article to help your users help themselves."
                  : "Start with a few categories, then write your first article."}
              </p>
            </div>
          ) : sortable ? (
            <SortableList
              items={items}
              label="Articles in order"
              itemLabel={(a) => `Reorder ${a.title}`}
              className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card"
              renderItem={(a, handle) => row(a, handle)}
              onMove={move}
            />
          ) : (
            <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
              {items.map((a) => (
                <li key={a.id}>{row(a)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {canManage ? (
        <ArticleCategoriesDialog
          open={categoriesOpen}
          onOpenChange={(open) => {
            setCategoriesOpen(open);
            // Names and icons also show in the article rows.
            if (!open) router.refresh();
          }}
          workspace={workspace}
          categories={categories}
          onChange={setCategories}
        />
      ) : null}
    </div>
  );
}

function CategoryLink({
  href,
  active,
  label,
  icon,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground",
        active
          ? "bg-accent font-medium text-foreground"
          : "hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="font-mono text-[11px] text-faint">{count}</span>
      ) : null}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5">
      <span className="font-mono text-[11px] tracking-[0.08em] text-faint uppercase">
        {label}
      </span>
      <span className="font-display text-2xl leading-none font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString("en") : value}
      </span>
    </div>
  );
}

/** Share of ratings that were "helpful", as a small meter (doc 30). */
function Helpful({
  likes,
  neutrals,
  dislikes,
}: {
  likes: number;
  neutrals: number;
  dislikes: number;
}) {
  const total = likes + neutrals + dislikes;
  if (!total) {
    return (
      <span className="w-24 shrink-0 pr-4 text-right text-xs text-faint">
        No ratings
      </span>
    );
  }
  const pct = Math.round((likes / total) * 100);
  const tone =
    pct >= 70
      ? "var(--stage-shipped)"
      : pct >= 40
        ? "var(--stage-review)"
        : "var(--signal)";
  return (
    <span
      className="flex w-24 shrink-0 items-center justify-end gap-2 pr-4"
      title={`${likes} helpful, ${neutrals} neutral, ${dislikes} not helpful`}
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: tone }}
        />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {pct}%
      </span>
    </span>
  );
}
