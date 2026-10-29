"use client";

import { CalendarClock, Pin, Plus, Search, Shapes } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createUpdateAction } from "@/app/(dashboard)/_actions/updates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UpdateTab } from "@/lib/schemas/updates";
import { cn } from "@/lib/utils";
import type { UpdateRow } from "@/server/services/updates";
import { CategoriesDialog, type CategoryOption } from "./categories-dialog";

const TABS: { key: UpdateTab; label: string }[] = [
  { key: "published", label: "Published" },
  { key: "scheduled", label: "Scheduled" },
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

export function UpdatesView({
  workspace,
  canManage,
  tab,
  query,
  categoryId,
  counts,
  categories: initialCategories,
  items,
}: {
  workspace: string;
  canManage: boolean;
  tab: UpdateTab;
  query: string;
  categoryId: string;
  counts: Partial<Record<UpdateTab, number>>;
  categories: CategoryOption[];
  items: UpdateRow[];
}) {
  const router = useRouter();
  const base = `/dashboard/${workspace}/updates`;
  const [categories, setCategories] = useState(initialCategories);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  async function newPost() {
    setCreating(true);
    const result = await createUpdateAction({ workspace });
    setCreating(false);
    if (!result.ok) return toast.error(result.error);
    router.push(`${base}/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Updates</h1>
        <p className="text-sm text-muted-foreground">
          Tell your users what shipped. Published posts appear on your public
          site and can be emailed to subscribers.
        </p>
      </div>

      <nav className="flex gap-1 border-b text-sm" aria-label="Post status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "published" ? base : `${base}?tab=${t.key}`}
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
        <Button onClick={newPost} disabled={creating}>
          <Plus />
          New post
        </Button>
        <form
          action={base}
          className="ml-auto flex flex-wrap items-center gap-2"
          aria-label="Filter posts"
        >
          {tab !== "published" ? (
            <input type="hidden" name="tab" value={tab} />
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={query}
              aria-label="Search posts"
              placeholder="Search…"
              className="w-56 pl-8"
            />
          </div>
          <select
            name="category"
            defaultValue={categoryId}
            aria-label="Category"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-9 cursor-pointer rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </form>
        {canManage ? (
          <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
            <Shapes />
            Categories
          </Button>
        ) : null}
      </div>

      {items.length ? (
        <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`${base}/${p.id}`}
                className="flex flex-col gap-1.5 px-5 py-4 hover:bg-muted/40"
              >
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {p.category ? (
                    <span className="flex items-center gap-1.5 rounded border px-2 py-0.5 text-foreground">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: p.category.color }}
                      />
                      {p.category.name}
                    </span>
                  ) : null}
                  {p.pinned ? (
                    <span className="flex items-center gap-1">
                      <Pin className="size-3.5" />
                      Pinned
                    </span>
                  ) : null}
                  {p.isPublic ? null : <Badge variant="outline">Private</Badge>}
                  {p.status === "scheduled" ? (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3.5" />
                      {formatDate(p.publishAt)}
                    </span>
                  ) : p.status === "published" ? (
                    <span>{formatDate(p.publishedAt)}</span>
                  ) : (
                    <span>Edited {formatDate(p.updatedAt)}</span>
                  )}
                  {p.cards ? (
                    <span>
                      {p.cards} {p.cards === 1 ? "card" : "cards"}
                    </span>
                  ) : null}
                </span>
                <span className="font-medium">{p.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
          <p className="font-medium">
            {query || categoryId
              ? "No posts match."
              : tab === "draft"
                ? "No drafts."
                : tab === "scheduled"
                  ? "Nothing scheduled."
                  : "Nothing published yet."}
          </p>
          <p className="text-sm text-muted-foreground">
            Write a post, or use “Announce…” on a completed roadmap card.
          </p>
        </div>
      )}

      {canManage ? (
        <CategoriesDialog
          open={categoriesOpen}
          onOpenChange={setCategoriesOpen}
          workspace={workspace}
          categories={categories}
          onChange={setCategories}
        />
      ) : null}
    </div>
  );
}
