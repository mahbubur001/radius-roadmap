"use client";

import {
  ChevronUp,
  Filter,
  Lightbulb,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createFeedbackAction } from "@/app/(dashboard)/_actions/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FEEDBACK_SORTS,
  type FeedbackFilter,
  PRIORITY_BUCKETS,
  priorityBucket,
} from "@/lib/schemas/feedback";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";
import { FeedbackDrawer } from "./feedback-drawer";
import type { FeedbackData, FeedbackRow } from "./types";

const ALL = "all";

/** URL param ↔ filter field. Defaults are left out of the URL. */
const PARAMS = {
  q: "q",
  sort: "sort",
  statusId: "status",
  categoryId: "category",
  tagId: "tag",
  visibility: "vis",
  linked: "linked",
  priority: "priority",
  state: "state",
} as const;
const DEFAULTS: Record<string, string> = {
  sort: "votes",
  vis: ALL,
  linked: ALL,
  priority: ALL,
  state: "open",
};

export function FeedbackView({
  data,
  filter,
  initialFeedbackId,
}: {
  data: FeedbackData;
  filter: FeedbackFilter;
  initialFeedbackId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const { workspace } = data;

  const [items, setItems] = useState(data.items);
  const [tags, setTags] = useState(data.tags);
  useEffect(() => setItems(data.items), [data.items]);
  useEffect(() => setTags(data.tags), [data.tags]);

  const [q, setQ] = useState(filter.q ?? "");
  const [openId, setOpenId] = useState<string | null>(
    initialFeedbackId ?? null,
  );
  const [creating, setCreating] = useState(false);

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (!value || value === ALL || DEFAULTS[key] === value)
          next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      startTransition(() =>
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        }),
      );
    },
    [router, pathname, searchParams],
  );

  // Search goes to the server after a short pause in typing.
  useEffect(() => {
    if (q === (filter.q ?? "")) return;
    const timer = setTimeout(() => setParams({ q: q.trim() || null }), 300);
    return () => clearTimeout(timer);
  }, [q, filter.q, setParams]);

  // Keep ?feedback=<id> in the URL so an item can be linked and survives reload.
  const openItem = useCallback((id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("feedback", id);
    else url.searchParams.delete("feedback");
    window.history.replaceState(null, "", url);
  }, []);
  const closeItem = useCallback(() => openItem(null), [openItem]);

  const patchItem = useCallback((id: string, change: Partial<FeedbackRow>) => {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }, []);
  const removeItem = useCallback((id: string) => {
    setItems((all) => all.filter((i) => i.id !== id));
  }, []);

  const statusById = new Map(data.statuses.map((s) => [s.id, s]));
  const categoryById = new Map(data.categories.map((c) => [c.id, c]));
  const board = data.boards.find((b) => b.id === data.boardId);

  const secondary = [
    filter.categoryId,
    filter.tagId,
    filter.visibility !== ALL ? filter.visibility : null,
    filter.linked !== ALL ? filter.linked : null,
    filter.priority !== ALL ? filter.priority : null,
    filter.state !== "open" ? filter.state : null,
  ].filter(Boolean).length;

  if (!board) {
    return (
      <p className="text-sm text-muted-foreground">
        This workspace has no feedback board yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.boards.length > 1 ? (
          <Select
            value={board.slug}
            onValueChange={(b) =>
              router.push(
                `/dashboard/${workspace}/feedback?b=${encodeURIComponent(b)}`,
              )
            }
          >
            <SelectTrigger aria-label="Board" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.boards.map((b) => (
                <SelectItem key={b.id} value={b.slug}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <h2 className="text-lg font-semibold">{board.name}</h2>
        )}
        {board.isPublic ? null : <Badge variant="outline">Private board</Badge>}

        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search feedback"
            placeholder="Search feedback"
            className="w-56 pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Select
          value={filter.sort ?? "votes"}
          onValueChange={(sort) => setParams({ sort })}
        >
          <SelectTrigger aria-label="Sort" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FEEDBACK_SORTS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filter.statusId ?? ALL}
          onValueChange={(status) => setParams({ status })}
        >
          <SelectTrigger aria-label="Filter by status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {data.statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter />
              Filters
              {secondary ? (
                <Badge variant="secondary">{secondary}</Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="grid w-72 gap-3">
            <FilterSelect
              label="Show"
              value={filter.state ?? "open"}
              onChange={(state) => setParams({ state })}
              options={[
                ["open", "Open"],
                ["completed", "Completed"],
                ["archived", "Archived and rejected"],
                [ALL, "Everything"],
              ]}
            />
            <FilterSelect
              label="Category"
              value={filter.categoryId ?? ALL}
              onChange={(category) => setParams({ category })}
              options={[
                [ALL, "All categories"],
                ...data.categories.map((c) => [c.id, c.name] as const),
              ]}
            />
            {tags.length ? (
              <FilterSelect
                label="Tag"
                value={filter.tagId ?? ALL}
                onChange={(tag) => setParams({ tag })}
                options={[
                  [ALL, "All tags"],
                  ...tags.map((t) => [t.id, t.name] as const),
                ]}
              />
            ) : null}
            <FilterSelect
              label="Visibility"
              value={filter.visibility ?? ALL}
              onChange={(vis) => setParams({ vis })}
              options={[
                [ALL, "Public + private"],
                ["public", "Public only"],
                ["private", "Private only"],
              ]}
            />
            <FilterSelect
              label="Roadmap card"
              value={filter.linked ?? ALL}
              onChange={(linked) => setParams({ linked })}
              options={[
                [ALL, "Linked or not"],
                ["linked", "Linked to a card"],
                ["unlinked", "Not linked"],
              ]}
            />
            <FilterSelect
              label="Priority"
              value={filter.priority ?? ALL}
              onChange={(priority) => setParams({ priority })}
              options={[
                [ALL, "Any priority"],
                ...Object.entries(PRIORITY_BUCKETS).map(
                  ([key, b]) => [key, b.label] as const,
                ),
                ["none", "No score yet"],
              ]}
            />
            {secondary ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setParams(
                    Object.fromEntries(
                      Object.values(PARAMS)
                        .filter((p) => !["q", "sort", "status"].includes(p))
                        .map((p) => [p, null]),
                    ),
                  )
                }
              >
                Clear filters
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>

        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New feedback
          </Button>
        </div>
      </div>

      <ul
        className={cn(
          "flex flex-col divide-y rounded-lg border transition-opacity",
          pending && "opacity-60",
        )}
        aria-busy={pending}
      >
        {items.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            {filter.q || secondary || filter.statusId
              ? "No feedback matches these filters."
              : "No feedback yet. Add the first item, or share your public board."}
          </li>
        ) : null}
        {items.map((item) => {
          const status = statusById.get(item.statusId);
          const category = item.categoryId
            ? categoryById.get(item.categoryId)
            : null;
          const bucket = priorityBucket(item.priority);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => openItem(item.id)}
                className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <span className="flex w-12 shrink-0 flex-col items-center rounded-md border py-1 text-sm font-medium">
                  <ChevronUp className="size-4 text-muted-foreground" />
                  {item.votes}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {status ? (
                      <Badge
                        variant="outline"
                        className="gap-1.5"
                        style={{ borderColor: status.color }}
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </Badge>
                    ) : null}
                    {item.review === "pending" ? (
                      <Badge variant="secondary">Waiting for review</Badge>
                    ) : null}
                    {item.review === "rejected" ? (
                      <Badge variant="outline">Rejected</Badge>
                    ) : null}
                    {item.isPublic ? null : (
                      <Badge variant="outline">Private</Badge>
                    )}
                    {item.archived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : null}
                    {category ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate font-medium">{item.title}</span>
                  {item.summaryText ? (
                    <span className="line-clamp-1 text-sm text-muted-foreground">
                      {item.summaryText}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                  <span suppressHydrationWarning>
                    {ago(new Date(item.updatedAt))}
                  </span>
                  <span className="flex items-center gap-2">
                    {bucket ? (
                      <Badge variant="secondary">
                        {PRIORITY_BUCKETS[bucket].label} · {item.priority}
                      </Badge>
                    ) : null}
                    {item.linkedCards ? (
                      <span
                        className="flex items-center gap-0.5"
                        title="Linked to a roadmap card"
                      >
                        <Lightbulb className="size-3.5" />
                        {item.linkedCards}
                      </span>
                    ) : null}
                    {item.comments ? (
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="size-3.5" />
                        {item.comments}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <NewFeedbackDialog
        open={creating}
        onOpenChange={setCreating}
        workspace={workspace}
        boardId={board.id}
        onCreated={(id) => {
          router.refresh();
          openItem(id);
        }}
      />

      <FeedbackDrawer
        workspace={workspace}
        workspaceId={data.workspaceId}
        feedbackId={openId}
        boards={data.boards}
        statuses={data.statuses}
        categories={data.categories}
        tags={tags}
        onClose={closeItem}
        onChanged={patchItem}
        onRemoved={removeItem}
        onTagCreated={(tag) =>
          setTags((all) =>
            all.some((t) => t.id === tag.id)
              ? all
              : [...all, tag].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string])[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NewFeedbackDialog({
  open,
  onOpenChange,
  workspace,
  boardId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  boardId: string;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const result = await createFeedbackAction({
      workspace,
      boardId,
      title: title.trim(),
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.error);
    setTitle("");
    onOpenChange(false);
    onCreated(result.data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>New feedback</DialogTitle>
            <DialogDescription>
              Added by the team, so it skips the review inbox. Add the details
              after creating it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-feedback-title">Title</Label>
            <Input
              id="new-feedback-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !title.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
