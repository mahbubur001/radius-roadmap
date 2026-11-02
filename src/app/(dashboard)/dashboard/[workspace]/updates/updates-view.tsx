"use client";

import { CalendarClock, Pin, Plus, Search, Shapes, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createUpdateAction } from "@/app/(dashboard)/_actions/updates";
import { StageTick } from "@/components/dashboard/stage-tick";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UpdateTab } from "@/lib/schemas/updates";
import { cn } from "@/lib/utils";
import type { UpdateRow } from "@/server/services/updates";
import { CategoriesDialog, type CategoryOption } from "./categories-dialog";

const ALL = "all";

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
        <h1 className="text-2xl font-semibold">Updates</h1>
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
          <Select
            value={categoryId || ALL}
            onValueChange={(v) => {
              const next = new URLSearchParams();
              if (tab !== "published") next.set("tab", tab);
              if (query) next.set("q", query);
              if (v !== ALL) next.set("category", v);
              const qs = next.toString();
              router.push(qs ? `${base}?${qs}` : base);
            }}
          >
            <SelectTrigger aria-label="Category" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {categoryId ? (
            <input type="hidden" name="category" value={categoryId} />
          ) : null}
        </form>
        <Button variant="secondary" asChild>
          <Link href={`${base}/subscribers`}>
            <Users />
            Subscribers
          </Link>
        </Button>
        {canManage ? (
          <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
            <Shapes />
            Categories
          </Button>
        ) : null}
      </div>

      {items.length ? (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`${base}/${p.id}`}
                className="flex items-start gap-4 px-4 py-3.5 hover:bg-muted/50"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 size-10 shrink-0 rounded-lg"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in oklab, ${p.category?.color ?? "var(--stage-new)"} 40%, var(--muted)), var(--muted))`,
                  }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[14.5px] font-medium">
                    {p.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {p.category ? (
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
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
                    {p.isPublic ? null : (
                      <Badge variant="outline">Private</Badge>
                    )}
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
                      <span className="flex items-center gap-1.5">
                        <StageTick
                          stage={
                            p.status === "published" ? "announced" : "shipped"
                          }
                          label={false}
                        />
                        {p.cards} {p.cards === 1 ? "card" : "cards"}{" "}
                        {p.status === "published" ? "announced" : "to announce"}
                      </span>
                    ) : null}
                  </span>
                </span>
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
