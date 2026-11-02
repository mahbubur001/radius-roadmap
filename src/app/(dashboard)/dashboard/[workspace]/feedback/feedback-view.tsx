"use client";

import {
  Filter,
  Globe,
  Inbox,
  Lock,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Settings2,
  Shapes,
} from "lucide-react";
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
import { StageTick } from "@/components/dashboard/stage-tick";
import { useActionError } from "@/components/dashboard/use-action-error";
import { useMedia, WIDE } from "@/components/dashboard/use-media";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  REVIEW_ACTIONS,
  type ReviewAction,
} from "@/lib/schemas/feedback";
import { feedbackStage } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { BoardSettingsDialog } from "./board-settings-dialog";
import { FeedbackDrawer } from "./feedback-drawer";
import { BulkBar, FeedbackRowItem } from "./feedback-rows";
import { StatusesDialog } from "./statuses-dialog";
import type { FeedbackData, FeedbackMode, FeedbackRow } from "./types";

const ALL = "all";

/** URL param ↔ filter field. Defaults are left out of the URL. */
const PARAMS = {
  q: "q",
  sort: "sort",
  statusId: "status",
  objectiveId: "objective",
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
  if (!(target instanceof Element)) return false;
  const el = target;
  return (
    !!el.closest("input, textarea, select, [contenteditable], [role=dialog]") ||
    el.getAttribute("role") === "combobox"
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
  const actionError = useActionError();
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
  // Open by default when the URL already narrows the list.
  const [showFilters, setShowFilters] = useState(
    [...searchParams.keys()].some(
      (k) => k !== "b" && k !== "q" && k !== "feedback" && k !== "edit",
    ),
  );
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
    objectiveId?: string | null;
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

  // Keyboard: j/k move (and open, when the detail sits beside the list),
  // x selects, Enter opens; a/p/r review in the inbox.
  const wideList = useMedia(WIDE);
  useEffect(() => {
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
        const nextItem = items[next];
        if (wideList && nextItem) openItem(nextItem.id);
      } else if (e.key === "x" && item) {
        setSelected((all) => {
          const next = new Set(all);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      } else if (e.key === "Enter" && item) {
        openItem(item.id);
      } else if (inbox && REVIEW_KEYS[e.key] && item) {
        e.preventDefault();
        void review(
          selectedIds.length ? selectedIds : [item.id],
          REVIEW_KEYS[e.key] as ReviewAction,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inbox, wideList, items, focusIndex, selectedIds, review, openItem]);

  const statusById = useMemo(
    () => new Map(statuses.map((s) => [s.id, s])),
    [statuses],
  );
  const objectiveById = new Map(data.objectives.map((c) => [c.id, c]));
  const boardById = new Map(data.boards.map((b) => [b.id, b]));
  const board = data.boards.find((b) => b.id === data.boardId);

  const filterCount = [
    filter.sort && filter.sort !== defaults.sort ? filter.sort : null,
    filter.statusId,
    filter.objectiveId,
    filter.tagId,
    filter.visibility !== ALL ? filter.visibility : null,
    filter.linked !== ALL ? filter.linked : null,
    filter.priority !== ALL ? filter.priority : null,
    filter.state !== "open" ? filter.state : null,
  ].filter(Boolean).length;

  const wide = wideList;
  const drawerProps = {
    workspace,
    workspaceId: data.workspaceId,
    feedbackId: openId,
    boards: data.boards,
    statuses,
    objectives: data.objectives,
    tags,
    onClose: closeItem,
    onChanged: patchItem,
    onRemoved: removeItem,
    onOpenItem: openItem,
    publicComments: data.publicComments,
    onTagCreated: (tag: { id: string; name: string }) =>
      setTags((all) =>
        all.some((t) => t.id === tag.id)
          ? all
          : [...all, tag].sort((a, b) => a.name.localeCompare(b.name)),
      ),
  };

  async function newBoard() {
    const result = await createBoardAction({ workspace, name: "New board" });
    if (!result.ok) return actionError(result);
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
  const pane = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
      active && "bg-accent font-medium text-foreground",
    );
  const group =
    "px-2 pt-4 pb-1 font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase";

  return (
    // Fills the scrolling sheet edge to edge (the sheet is `relative`).
    <div className="absolute inset-0 flex min-h-0">
      {/* Views: inbox, boards, statuses */}
      <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r p-2 lg:flex">
        <Link
          href={`${base}/inbox`}
          aria-current={inbox ? "page" : undefined}
          className={pane(inbox)}
        >
          <Inbox className="size-4" />
          Inbox
          {data.inboxCount ? (
            <span className="ml-auto font-mono text-[11px] text-signal">
              {data.inboxCount}
            </span>
          ) : null}
        </Link>
        {data.publicComments || data.pendingComments ? (
          <Link href={`${base}/comments`} className={pane(false)}>
            <MessageSquare className="size-4" />
            Comments
            {data.pendingComments ? (
              <span className="ml-auto font-mono text-[11px] text-faint">
                {data.pendingComments}
              </span>
            ) : null}
          </Link>
        ) : null}

        <p className={group}>Boards</p>
        <nav aria-label="Boards" className="flex flex-col gap-0.5">
          {data.boards.map((b) => {
            const active = !inbox && b.id === board.id;
            return (
              <Link
                key={b.id}
                href={`${base}?b=${encodeURIComponent(b.slug)}`}
                aria-current={active ? "page" : undefined}
                className={pane(active)}
              >
                {b.isPublic ? (
                  <Globe className="size-3.5 shrink-0 text-faint" />
                ) : (
                  <Lock
                    className="size-3.5 shrink-0 text-faint"
                    aria-label="Private board"
                  />
                )}
                <span className="truncate">{b.name}</span>
                <span className="ml-auto font-mono text-[11px] text-faint">
                  {b.openCount}
                </span>
              </Link>
            );
          })}
        </nav>

        <p className={group}>By status</p>
        <div className="flex flex-col gap-0.5">
          {statuses.map((st) => {
            const active = filter.statusId === st.id;
            return (
              <button
                key={st.id}
                type="button"
                aria-pressed={active}
                onClick={() => setParams({ status: active ? null : st.id })}
                className={cn(pane(active), "text-left")}
              >
                <StageTick
                  stage={feedbackStage({ review: "approved", kind: st.kind })}
                  label={false}
                />
                <span className="truncate">{st.name}</span>
              </button>
            );
          })}
        </div>

        {data.canManage ? (
          <div className="mt-auto flex items-center gap-1 pt-4">
            {inbox ? null : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBoardSettingsOpen(true)}
              >
                <Settings2 />
                Edit board
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="ml-auto">
                  More
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onSelect={() => setStatusesOpen(true)}>
                  <Shapes />
                  Statuses
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={newBoard}>
                  <Plus />
                  New board
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </aside>

      {/* The list */}
      <section
        aria-label={inbox ? "Inbox" : board.name}
        className={cn(
          "flex min-w-0 flex-col border-r",
          wide ? "w-[400px] shrink-0" : "flex-1",
        )}
      >
        <header className="flex flex-col gap-2 border-b p-3">
          {/* Small screens: the views pane is hidden, so boards sit here. */}
          <nav
            aria-label="Boards and inbox"
            className="-mx-1 flex gap-1 overflow-x-auto text-[13px] lg:hidden"
          >
            {data.boards.map((b) => (
              <Link
                key={b.id}
                href={`${base}?b=${encodeURIComponent(b.slug)}`}
                aria-current={!inbox && b.id === board.id ? "page" : undefined}
                className={cn(pane(!inbox && b.id === board.id), "shrink-0")}
              >
                {b.name}
              </Link>
            ))}
            <Link
              href={`${base}/inbox`}
              aria-current={inbox ? "page" : undefined}
              className={cn(pane(inbox), "shrink-0")}
            >
              Inbox
              {data.inboxCount ? (
                <span className="font-mono text-[11px] text-signal">
                  {data.inboxCount}
                </span>
              ) : null}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
              {inbox ? "Inbox" : board.name}
            </h1>
            {inbox ? null : (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus />
                New feedback
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-2.5 text-faint">
              <Search className="size-3.5 shrink-0" />
              <input
                type="search"
                aria-label="Search feedback"
                placeholder={inbox ? "Search the inbox" : "Search feedback"}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((on) => !on)}
            >
              <Filter />
              {showFilters ? "Hide filters" : "Show filters"}
              {filterCount ? (
                <Badge variant="secondary">{filterCount}</Badge>
              ) : null}
            </Button>
          </div>
          {showFilters ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <FilterSelect
                label="Sort"
                value={filter.sort ?? defaults.sort ?? "votes"}
                onChange={(sort) => setParams({ sort })}
                options={Object.entries(FEEDBACK_SORTS)}
              />
              <FilterSelect
                label="Status"
                ariaLabel="Filter by status"
                value={filter.statusId ?? ALL}
                onChange={(status) => setParams({ status })}
                options={[
                  [ALL, "All statuses"],
                  ...statuses.map((st) => [st.id, st.name] as const),
                ]}
              />
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
                label="Objective"
                value={filter.objectiveId ?? ALL}
                onChange={(objective) => setParams({ objective })}
                options={[
                  [ALL, "All objectives"],
                  ...data.objectives.map((c) => [c.id, c.name] as const),
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
              {filterCount ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-span-2 justify-self-start"
                  onClick={() =>
                    setParams(
                      Object.fromEntries(
                        Object.values(PARAMS)
                          .filter((p) => p !== "q")
                          .map((p) => [p, null]),
                      ),
                    )
                  }
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : null}
          {selectedIds.length ? (
            <BulkBar
              count={selectedIds.length}
              inbox={inbox}
              statuses={statuses}
              objectives={data.objectives}
              busy={busy}
              onReview={(action) => review(selectedIds, action)}
              onStatus={(statusId) => bulk({ statusId })}
              onObjective={(objectiveId) => bulk({ objectiveId })}
              onClear={() => setSelected(new Set())}
            />
          ) : null}
        </header>

        {items.length ? (
          <div className="flex items-center gap-3 border-b px-4 py-1.5 font-mono text-[11px] text-faint">
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

        <ul
          className={cn(
            "min-h-0 flex-1 overflow-y-auto transition-opacity",
            pending && "opacity-60",
          )}
          aria-busy={pending}
        >
          {items.length === 0 ? (
            <li className="px-6 py-12 text-center text-sm text-muted-foreground">
              {inbox
                ? "You're all caught up. New submissions from your public board land here."
                : filter.q || filterCount
                  ? "No feedback matches these filters."
                  : "No feedback yet. Add the first item, or share your public board."}
            </li>
          ) : null}
          {items.map((item, index) => (
            <FeedbackRowItem
              key={item.id}
              item={item}
              status={statusById.get(item.statusId)}
              objective={
                item.objectiveId ? objectiveById.get(item.objectiveId) : null
              }
              board={inbox ? boardById.get(item.boardId) : undefined}
              selected={selected.has(item.id)}
              focused={index === focusIndex && (inbox || wide)}
              open={wide && item.id === openId}
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

        {items.length ? (
          <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11.5px] text-faint">
            <Key keys={["J", "K"]}>move</Key>
            <Key keys={["↵"]}>open</Key>
            <Key keys={["X"]}>select</Key>
            {inbox ? (
              <>
                <Key keys={["A"]}>approve</Key>
                <Key keys={["P"]}>private</Key>
                <Key keys={["R"]}>reject</Key>
              </>
            ) : null}
          </footer>
        ) : null}
      </section>

      {/* Detail: inline on wide screens, a drawer otherwise */}
      {wide ? (
        <div className="min-w-0 flex-1">
          {openId ? null : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="font-display text-base font-semibold">
                Pick an idea
              </p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Its details, votes and comments open here. Use J and K to move
                through the list.
              </p>
            </div>
          )}
          <FeedbackDrawer inline {...drawerProps} />
        </div>
      ) : (
        <FeedbackDrawer {...drawerProps} />
      )}

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

function Key({ keys, children }: { keys: string[]; children: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
      {children}
    </span>
  );
}

function FilterSelect({
  label,
  ariaLabel = label,
  value,
  onChange,
  options,
}: {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string])[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={ariaLabel} className="w-full">
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
