"use client";

import { Filter, Inbox, Plus, Search, Settings2, Shapes } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  bulkUpdateFeedbackAction,
  createBoardAction,
  createFeedbackAction,
  reviewFeedbackAction,
} from "@/app/(dashboard)/_actions/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FEEDBACK_SORTS,
  type FeedbackFilter,
  PRIORITY_BUCKETS,
  REVIEW_ACTIONS,
  type ReviewAction,
} from "@/lib/schemas/feedback";
import { cn } from "@/lib/utils";
import { BoardSettingsDialog } from "./board-settings-dialog";
import { FeedbackDrawer } from "./feedback-drawer";
import { BulkBar, FeedbackRowItem } from "./feedback-rows";
import { StatusesDialog } from "./statuses-dialog";
import type { FeedbackData, FeedbackMode, FeedbackRow } from "./types";

const ALL = "all";
const NEW_BOARD = "__new";

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

const LIST_DEFAULTS: Record<string, string> = {
  sort: "votes",
  vis: ALL,
  linked: ALL,
  priority: ALL,
  state: "open",
};
const INBOX_DEFAULTS: Record<string, string> = {
  ...LIST_DEFAULTS,
  sort: "oldest",
};

/** Keyboard shortcuts in the inbox: j/k move, x selects, a/p/r review. */
const REVIEW_KEYS: Record<string, ReviewAction> = {
  a: "approve",
  p: "keep_private",
  r: "reject",
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el?.closest(
      "input, textarea, select, [contenteditable], [role=dialog]",
    ) || el?.getAttribute("role") === "combobox"
  );
}

export function FeedbackView({
  data,
  filter,
  mode,
  initialFeedbackId,
}: {
  data: FeedbackData;
  filter: FeedbackFilter;
  mode: FeedbackMode;
  initialFeedbackId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const { workspace } = data;
  const inbox = mode === "inbox";
  const base = `/dashboard/${workspace}/feedback`;
  const defaults = inbox ? INBOX_DEFAULTS : LIST_DEFAULTS;

  const [items, setItems] = useState(data.items);
  const [tags, setTags] = useState(data.tags);
  const [statuses, setStatuses] = useState(data.statuses);
  useEffect(() => setItems(data.items), [data.items]);
  useEffect(() => setTags(data.tags), [data.tags]);
  useEffect(() => setStatuses(data.statuses), [data.statuses]);

  const [q, setQ] = useState(filter.q ?? "");
  const [openId, setOpenId] = useState<string | null>(
    initialFeedbackId ?? null,
  );
  const [creating, setCreating] = useState(false);
  // `?edit=board` opens the board settings (set after "New board", which
  // navigates to the new board and so remounts this view).
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(
    searchParams.get("edit") === "board",
  );
  const toggleBoardSettings = useCallback((open: boolean) => {
    setBoardSettingsOpen(open);
    if (open) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    window.history.replaceState(null, "", url);
  }, []);
  const [statusesOpen, setStatusesOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(false);

  // Selection and focus only count rows still on screen (filters, reviews).
  // Derived, not synced in an effect: an effect here loops while a server
  // action's refresh is pending.
  const shownIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const selectedIds = useMemo(
    () => [...selected].filter((id) => shownIds.has(id)),
    [selected, shownIds],
  );
  const focusIndex = Math.min(focus, Math.max(items.length - 1, 0));

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (!value || value === ALL || defaults[key] === value)
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
    [router, pathname, searchParams, defaults],
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

  const review = useCallback(
    async (ids: string[], action: ReviewAction) => {
      if (!ids.length || busy) return;
      setBusy(true);
      const result = await reviewFeedbackAction({ workspace, ids, action });
      setBusy(false);
      if (!result.ok) return toast.error(result.error);
      // Reviewed items leave the inbox; in the list they just change badges.
      setItems((all) =>
        inbox
          ? all.filter((i) => !ids.includes(i.id))
          : all.map((i) =>
              ids.includes(i.id)
                ? {
                    ...i,
                    review: action === "reject" ? "rejected" : "approved",
                    isPublic:
                      action === "approve"
                        ? true
                        : action === "keep_private"
                          ? false
                          : i.isPublic,
                    archived: action === "reject" ? true : i.archived,
                  }
                : i,
            ),
      );
      setSelected(new Set());
      toast.success(
        `${REVIEW_ACTIONS[action]}: ${result.data} ${result.data === 1 ? "item" : "items"}.`,
      );
      // The action invalidates the cache, so Next refreshes the page (and
      // the sidebar's inbox count) by itself.
    },
    [workspace, inbox, busy],
  );

  async function bulk(change: {
    statusId?: string;
    categoryId?: string | null;
  }) {
    const ids = selectedIds;
    if (!ids.length) return;
    setBusy(true);
    const result = await bulkUpdateFeedbackAction({
      workspace,
      ids,
      ...change,
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    const done =
      change.statusId &&
      statuses.find((s) => s.id === change.statusId)?.kind === "done";
    setItems((all) =>
      all.map((i) =>
        ids.includes(i.id)
          ? {
              ...i,
              ...change,
              ...(change.statusId ? { completed: !!done } : {}),
            }
          : i,
      ),
    );
    toast.success(
      `Updated ${result.data} ${result.data === 1 ? "item" : "items"}.`,
    );
  }

  // Inbox keyboard shortcuts.
  useEffect(() => {
    if (!inbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const item = items[focusIndex];
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = Math.max(
          0,
          Math.min(items.length - 1, focusIndex + (e.key === "j" ? 1 : -1)),
        );
        setFocus(next);
        document
          .querySelector(`[data-feedback-row="${items[next]?.id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "x" && item) {
        setSelected((all) => {
          const next = new Set(all);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      } else if (e.key === "Enter" && item) {
        openItem(item.id);
      } else if (REVIEW_KEYS[e.key] && item) {
        e.preventDefault();
        void review(
          selectedIds.length ? selectedIds : [item.id],
          REVIEW_KEYS[e.key] as ReviewAction,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inbox, items, focusIndex, selectedIds, review, openItem]);

  const statusById = useMemo(
    () => new Map(statuses.map((s) => [s.id, s])),
    [statuses],
  );
  const categoryById = new Map(data.categories.map((c) => [c.id, c]));
  const boardById = new Map(data.boards.map((b) => [b.id, b]));
  const board = data.boards.find((b) => b.id === data.boardId);

  const secondary = [
    filter.categoryId,
    filter.tagId,
    filter.visibility !== ALL ? filter.visibility : null,
    filter.linked !== ALL ? filter.linked : null,
    filter.priority !== ALL ? filter.priority : null,
    filter.state !== "open" ? filter.state : null,
  ].filter(Boolean).length;

  async function switchBoard(value: string) {
    if (value !== NEW_BOARD) {
      router.push(`${base}?b=${encodeURIComponent(value)}`);
      return;
    }
    const result = await createBoardAction({ workspace, name: "New board" });
    if (!result.ok) return toast.error(result.error);
    router.push(`${base}?b=${result.data.slug}&edit=board`);
  }

  if (!board) {
    return (
      <p className="text-sm text-muted-foreground">
        This workspace has no feedback board yet.
      </p>
    );
  }

  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-1 border-b text-sm" aria-label="Feedback views">
        <Link
          href={base}
          className={cn(
            "-mb-px border-b-2 px-3 py-2",
            inbox
              ? "border-transparent text-muted-foreground hover:text-foreground"
              : "border-primary font-medium",
          )}
        >
          All feedback
        </Link>
        <Link
          href={`${base}/inbox`}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2",
            inbox
              ? "border-primary font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Inbox className="size-4" />
          Inbox
          {data.inboxCount ? (
            <Badge variant="secondary">{data.inboxCount}</Badge>
          ) : null}
        </Link>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        {inbox ? null : data.boards.length > 1 || data.canManage ? (
          <Select value={board.slug} onValueChange={switchBoard}>
            <SelectTrigger aria-label="Board" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.boards.map((b) => (
                <SelectItem key={b.id} value={b.slug}>
                  {b.name}
                </SelectItem>
              ))}
              {data.canManage ? (
                <>
                  <SelectSeparator />
                  <SelectItem value={NEW_BOARD}>
                    <Plus />
                    New board
                  </SelectItem>
                </>
              ) : null}
            </SelectContent>
          </Select>
        ) : (
          <h2 className="text-lg font-semibold">{board.name}</h2>
        )}
        {!inbox && !board.isPublic ? (
          <Badge variant="outline">Private board</Badge>
        ) : null}

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
          value={filter.sort ?? defaults.sort}
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
            {statuses.map((s) => (
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

        <div className="ml-auto flex items-center gap-2">
          {data.canManage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusesOpen(true)}
              >
                <Shapes />
                Statuses
              </Button>
              {inbox ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBoardSettingsOpen(true)}
                >
                  <Settings2 />
                  Edit board
                </Button>
              )}
            </>
          ) : null}
          {inbox ? null : (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              New feedback
            </Button>
          )}
        </div>
      </div>

      {selectedIds.length ? (
        <BulkBar
          count={selectedIds.length}
          inbox={inbox}
          statuses={statuses}
          categories={data.categories}
          busy={busy}
          onReview={(action) => review(selectedIds, action)}
          onStatus={(statusId) => bulk({ statusId })}
          onCategory={(categoryId) => bulk({ categoryId })}
          onClear={() => setSelected(new Set())}
        />
      ) : inbox && items.length ? (
        <p className="text-xs text-muted-foreground">
          Shortcuts: <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>x</kbd> select,{" "}
          <kbd>Enter</kbd> open, <kbd>a</kbd> approve, <kbd>p</kbd> keep
          private, <kbd>r</kbd> reject.
        </p>
      ) : null}

      <div
        className={cn(
          "flex flex-col rounded-lg border transition-opacity",
          pending && "opacity-60",
        )}
      >
        {items.length ? (
          <div className="flex items-center gap-3 border-b px-3 py-2 text-xs text-muted-foreground">
            <Checkbox
              checked={
                allSelected
                  ? true
                  : selectedIds.length
                    ? "indeterminate"
                    : false
              }
              aria-label="Select all"
              onCheckedChange={(on) =>
                setSelected(
                  on === true ? new Set(items.map((i) => i.id)) : new Set(),
                )
              }
            />
            {items.length} {items.length === 1 ? "item" : "items"}
          </div>
        ) : null}
        <ul className="flex flex-col divide-y" aria-busy={pending}>
          {items.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              {inbox
                ? "You're all caught up. New submissions from your public board land here."
                : filter.q || secondary || filter.statusId
                  ? "No feedback matches these filters."
                  : "No feedback yet. Add the first item, or share your public board."}
            </li>
          ) : null}
          {items.map((item, index) => (
            <FeedbackRowItem
              key={item.id}
              item={item}
              status={statusById.get(item.statusId)}
              category={
                item.categoryId ? categoryById.get(item.categoryId) : null
              }
              board={inbox ? boardById.get(item.boardId) : undefined}
              selected={selected.has(item.id)}
              focused={inbox && index === focusIndex}
              onSelect={(on) =>
                setSelected((all) => {
                  const next = new Set(all);
                  if (on) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                })
              }
              onOpen={() => {
                setFocus(index);
                openItem(item.id);
              }}
            />
          ))}
        </ul>
      </div>

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
        statuses={statuses}
        categories={data.categories}
        tags={tags}
        onClose={closeItem}
        onChanged={patchItem}
        onRemoved={removeItem}
        onOpenItem={openItem}
        onTagCreated={(tag) =>
          setTags((all) =>
            all.some((t) => t.id === tag.id)
              ? all
              : [...all, tag].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
      />

      {data.canManage ? (
        <>
          <StatusesDialog
            open={statusesOpen}
            onOpenChange={setStatusesOpen}
            workspace={workspace}
            statuses={statuses}
            onChange={setStatuses}
          />
          {inbox ? null : (
            <BoardSettingsDialog
              key={board.id}
              open={boardSettingsOpen}
              onOpenChange={toggleBoardSettings}
              workspace={workspace}
              board={board}
              canDelete={data.boards.length > 1}
            />
          )}
        </>
      ) : null}
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
