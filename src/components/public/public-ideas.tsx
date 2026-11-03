"use client";

import { Lightbulb, MessagesSquare, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { IdeaSort, PublicIdea } from "@/server/services/public-ideas";
import { DetailSheet } from "./detail-sheet";
import { Hint } from "./hint";
import { IdeaDetail, StatusChip } from "./idea-detail";
import { IdeaForm } from "./idea-form";
import { VoteButton } from "./vote-button";
import { useVoter } from "./voter-provider";

const SORTS: Record<IdeaSort, string> = {
  trending: "Trending",
  top: "Top",
  new: "New",
};

type Board = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

/**
 * The public Ideas page (doc 22 step 4): list on the left, the "Add new" form
 * on the right (a sheet on small screens). Filters are plain GET forms, so the
 * list stays server-rendered and cached.
 */
export function PublicIdeas({
  base,
  board,
  boards,
  statuses,
  items,
  sort,
  status,
  query,
  embed,
  commentsEnabled,
  followsEnabled,
  termsUrl,
  privacyUrl,
}: {
  /** e.g. "/acme/product/ideas" */
  base: string;
  board: Board;
  boards: Board[];
  statuses: { id: string; name: string; color: string }[];
  items: PublicIdea[];
  sort: IdeaSort;
  status: string;
  query: string;
  embed: boolean;
  commentsEnabled: boolean;
  followsEnabled: boolean;
  termsUrl: string | null;
  privacyUrl: string | null;
}) {
  const { pendingIdeas } = useVoter();
  const [open, setOpen] = useState<PublicIdea | null>(null);
  const [tab, setTab] = useState<"details" | "comments">("details");
  const [formOpen, setFormOpen] = useState(false);
  const mine = pendingIdeas.filter((i) => i.boardId === board.id);
  const embedParam = embed ? "embed=1" : "";

  /** This page with one filter changed (phone chips). */
  function filterHref(change: { sort?: IdeaSort; status?: string }) {
    const params = new URLSearchParams({ board: board.slug });
    if (query) params.set("q", query);
    const nextSort = change.sort ?? sort;
    if (nextSort !== "trending") params.set("sort", nextSort);
    const nextStatus = change.status ?? (change.sort ? "" : status);
    if (nextStatus) params.set("status", nextStatus);
    if (embed) params.set("embed", "1");
    return `${base}?${params}`;
  }
  const chip = (on: boolean) =>
    cn(
      "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
      on
        ? "bg-foreground text-background"
        : "text-muted-foreground ring-1 ring-border ring-inset",
    );

  useEffect(() => {
    const onPop = () => setOpen(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function href(idea: PublicIdea) {
    return `${base}/${idea.slug}${embed ? "?embed=1" : ""}`;
  }

  function openIdea(idea: PublicIdea, on: "details" | "comments" = "details") {
    setOpen(idea);
    setTab(on);
    window.history.pushState({ idea: idea.id }, "", href(idea));
  }

  function close() {
    setOpen(null);
    if (window.history.state?.idea) window.history.back();
  }

  const form = (
    <IdeaForm
      board={board}
      termsUrl={termsUrl}
      privacyUrl={privacyUrl}
      onDone={() => setFormOpen(false)}
      ideaHref={(slug) => `${base}/${slug}${embed ? "?embed=1" : ""}`}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {boards.length > 1 ? (
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Boards">
            {boards.map((b) => (
              <a
                key={b.id}
                href={`${base}?board=${b.slug}${embed ? "&embed=1" : ""}`}
                aria-current={b.id === board.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5",
                  b.id === board.id
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {b.name}
              </a>
            ))}
          </nav>
        ) : null}

        <search>
          <form
            action={base}
            className="flex flex-wrap items-center gap-2"
            aria-label="Filter ideas"
          >
            <input type="hidden" name="board" value={board.slug} />
            {embedParam ? <input type="hidden" name="embed" value="1" /> : null}
            <div className="relative w-full min-w-48 flex-1 sm:w-auto">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                defaultValue={query}
                aria-label="Search ideas"
                placeholder="Search…"
                className="h-10 pl-9 sm:h-9"
              />
            </div>
            <select
              name="sort"
              defaultValue={sort}
              aria-label="Sort"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="hidden h-9 cursor-pointer rounded-md border bg-transparent px-2 text-sm md:block"
            >
              {Object.entries(SORTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status}
              aria-label="Status"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="hidden h-9 cursor-pointer rounded-md border bg-transparent px-2 text-sm md:block"
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              className="hidden md:inline-flex lg:hidden"
              onClick={() => setFormOpen(true)}
            >
              <Plus />
              Suggest an idea
            </Button>
          </form>
        </search>

        {/* Phones: sort and status as chips instead of dropdowns (doc 31). */}
        <nav
          aria-label="Sort and filter"
          className="-mx-4 -mt-2 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
        >
          {(Object.entries(SORTS) as [IdeaSort, string][]).map(
            ([key, label]) => (
              <a
                key={key}
                href={filterHref({ sort: key })}
                aria-current={key === sort && !status ? "page" : undefined}
                className={chip(key === sort && !status)}
              >
                {label}
              </a>
            ),
          )}
          {statuses.length ? (
            <span aria-hidden className="mx-1 my-1.5 w-px shrink-0 bg-border" />
          ) : null}
          {statuses.map((st) => (
            <a
              key={st.id}
              href={filterHref({ status: st.id === status ? "" : st.id })}
              aria-current={st.id === status ? "page" : undefined}
              className={chip(st.id === status)}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: st.color }}
              />
              {st.name}
            </a>
          ))}
        </nav>

        {mine.length ? (
          <ul className="flex flex-col gap-2" aria-label="Your ideas">
            {mine.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {i.title}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Waiting for review
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {items.length ? (
          <div className="flex flex-col divide-y overflow-hidden rounded-md border bg-card text-card-foreground shadow-xs">
            {items.map((idea) => (
              <article
                key={idea.id}
                className="relative flex gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="relative z-10 pt-0.5">
                  <VoteButton
                    cardId={idea.id}
                    votes={idea.votes}
                    variant="pill"
                    kind="idea"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2 className="font-medium leading-snug">
                    <a
                      href={href(idea)}
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
                        openIdea(idea);
                      }}
                      className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                    >
                      {idea.title}
                    </a>
                  </h2>
                  {idea.preview ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {idea.preview}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <StatusChip status={idea.status} />
                    {idea.objective ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: idea.objective.color }}
                        />
                        {idea.objective.name}
                      </span>
                    ) : null}
                    {commentsEnabled ? (
                      <Hint label="Comments">
                        <button
                          type="button"
                          aria-label={`Comments (${idea.comments})`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openIdea(idea, "comments");
                          }}
                          className="relative z-10 -mx-1 flex items-center gap-1 rounded-md px-1 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <MessagesSquare className="size-3.5" />
                          {idea.comments}
                        </button>
                      </Hint>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : mine.length && !query && !status ? null : (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-12 text-center">
            <Lightbulb className="size-6 text-muted-foreground" />
            <p className="font-medium">
              {query || status ? "No ideas match." : "No ideas yet."}
            </p>
            <p className="text-sm text-muted-foreground">
              {query || status
                ? "Try another search or status."
                : "Be the first to suggest one."}
            </p>
          </div>
        )}
      </div>

      <aside
        aria-label="Add new"
        className="hidden self-start rounded-xl border bg-card p-6 text-card-foreground shadow-xs lg:sticky lg:top-6 lg:block"
      >
        <h2 className="mb-4 border-b pb-4 text-lg font-medium">Add new</h2>
        {form}
      </aside>

      {/* Phones: one floating button to share an idea (doc 31 M4). */}
      <Button
        type="button"
        onClick={() => setFormOpen(true)}
        className="fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 h-12 rounded-full px-5 text-[15px] shadow-lg md:hidden"
      >
        <Plus />
        Share an idea
      </Button>

      <DetailSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Suggest an idea"
        description="The team reads every idea."
        wide="md"
        fit
        className="p-6 pt-2 lg:hidden"
      >
        <h2 className="mb-1 text-lg font-semibold">Share an idea</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The team reads every idea.
        </p>
        {formOpen ? form : null}
      </DetailSheet>

      <DetailSheet
        open={!!open}
        onClose={close}
        title={open?.title ?? ""}
        description="Idea"
      >
        {open ? (
          <IdeaDetail
            key={`${open.id}-${tab}`}
            initialTab={tab}
            idea={open}
            commentsEnabled={commentsEnabled}
            followsEnabled={followsEnabled}
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}
