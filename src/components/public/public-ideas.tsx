"use client";

import { Lightbulb, MessageSquare, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { IdeaSort, PublicIdea } from "@/server/services/public-ideas";
import { DetailSheet } from "./detail-sheet";
import { IdeaDetail, StatusChip } from "./idea-detail";
import { IdeaForm } from "./idea-form";
import { ObjectiveMark } from "./objective-mark";
import { Chip } from "./public-board";
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
  workspaceName,
}: {
  workspaceName: string;
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
  const [formOpen, setFormOpen] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const share = params.get("share") === "1";

  // "Share an idea" in the header and the dock's + link here with ?share=1
  // (doc 32): the form opens in a sheet below desktop, else gets the focus.
  useEffect(() => {
    if (!share) return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
      document
        .querySelector<HTMLInputElement>("aside[aria-label='Add new'] input")
        ?.focus();
    } else {
      setFormOpen(true);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [share, router]);
  const mine = pendingIdeas.filter((i) => i.boardId === board.id);

  /** This page with one filter changed (chips). */
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

  useEffect(() => {
    const onPop = () => setOpen(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function href(idea: PublicIdea) {
    return `${base}/${idea.slug}${embed ? "?embed=1" : ""}`;
  }

  function openIdea(idea: PublicIdea) {
    setOpen(idea);
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
  const sortChips = (Object.entries(SORTS) as [IdeaSort, string][]).map(
    ([key, label]) => (
      <Chip
        key={key}
        on={key === sort && !status}
        href={filterHref({ sort: key })}
      >
        {label}
      </Chip>
    ),
  );
  const open_ = items.filter((i) => !i.completed).length;

  return (
    <div
      className={cn(
        "grid gap-0 pb-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-9 lg:pb-16",
        embed ? "pt-1" : "pt-[26px] md:pt-12",
      )}
    >
      <div className="min-w-0">
        {embed ? null : (
          <>
            <div className="font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase">
              Ideas · {open_} open
            </div>
            <h1 className="mt-2.5 mb-4 font-t-display text-[34px] leading-none font-bold tracking-[-0.03em] md:mb-6 md:text-[44px]">
              What should {workspaceName} build next?
            </h1>
            {board.description ? (
              <p className="-mt-2 mb-5 max-w-2xl text-muted-foreground md:-mt-3">
                {board.description}
              </p>
            ) : null}
          </>
        )}

        {boards.length > 1 ? (
          <nav
            aria-label="Boards"
            className="-mx-[18px] mb-3.5 flex gap-2.5 overflow-x-auto px-[18px] [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
          >
            {boards.map((b) => (
              <Chip
                key={b.id}
                on={b.id === board.id}
                href={`${base}?board=${b.slug}${embed ? "&embed=1" : ""}`}
              >
                {b.name}
              </Chip>
            ))}
          </nav>
        ) : null}

        <div className="mb-[22px] flex items-center gap-2.5">
          <search className="flex-1">
            <form
              action={base}
              aria-label="Filter ideas"
              className="flex h-10 items-center gap-2 rounded-full bg-sheet px-3.5 text-ink3 ring-1 ring-border focus-within:ring-2 focus-within:ring-ring"
            >
              <Search strokeWidth={1.8} className="size-4 shrink-0" />
              <input type="hidden" name="board" value={board.slug} />
              {sort !== "trending" ? (
                <input type="hidden" name="sort" value={sort} />
              ) : null}
              {status ? (
                <input type="hidden" name="status" value={status} />
              ) : null}
              {embed ? <input type="hidden" name="embed" value="1" /> : null}
              <input
                type="search"
                name="q"
                defaultValue={query}
                aria-label="Search ideas"
                placeholder="Search ideas"
                className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-ink3"
              />
            </form>
          </search>
          <div className="hidden gap-2.5 md:flex">{sortChips}</div>
          {/* Tablets and embeds: no form ticket beside the list, no dock. */}
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={cn(
              "h-10 shrink-0 items-center rounded-full bg-foreground px-4 font-semibold text-background lg:hidden",
              embed ? "flex" : "hidden md:flex",
            )}
          >
            Share an idea
          </button>
        </div>

        <nav
          aria-label="Sort and filter"
          className={cn(
            "-mx-[18px] -mt-2 mb-[18px] flex gap-2.5 overflow-x-auto px-[18px] [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden",
            !statuses.length && "md:hidden",
          )}
        >
          <div className="contents md:hidden">{sortChips}</div>
          {statuses.length ? (
            <>
              <span
                aria-hidden
                className="my-2 w-px shrink-0 bg-rule2 md:hidden"
              />
              {statuses.map((st) => (
                <Chip
                  key={st.id}
                  on={st.id === status}
                  href={filterHref({ status: st.id === status ? "" : st.id })}
                >
                  <i
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ backgroundColor: st.color }}
                  />
                  {st.name}
                </Chip>
              ))}
            </>
          ) : null}
        </nav>

        {mine.length ? (
          <ul
            aria-label="Your ideas"
            className="mb-[18px] flex flex-col gap-2 rounded-[14px] border-[1.5px] border-dashed border-rule2 px-4 py-3.5"
          >
            {mine.map((i) => (
              <li key={i.id} className="flex items-center gap-2.5 font-medium">
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="shrink-0 font-t-mono text-[10.5px] font-bold tracking-[0.1em] text-ink3 uppercase">
                  Waiting for review
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {items.length ? (
          <div className="border-t-2 border-foreground">
            <div
              aria-hidden
              className="hidden grid-cols-[76px_minmax(0,1fr)_150px_64px] gap-[18px] px-1 py-2.5 font-t-mono text-[11px] font-bold tracking-[0.14em] text-ink3 uppercase md:grid"
            >
              <span>Votes</span>
              <span>Idea</span>
              <span>Status</span>
              <span className="text-right">
                {commentsEnabled ? "Talk" : ""}
              </span>
            </div>
            {items.map((idea) => (
              <article
                key={idea.id}
                className="relative grid grid-cols-[62px_minmax(0,1fr)] items-center gap-3 border-b px-1 py-4 transition-colors hover:bg-sheet/70 md:grid-cols-[76px_minmax(0,1fr)_150px_64px] md:gap-[18px] md:py-[18px]"
              >
                <div className="relative z-10">
                  <VoteButton
                    cardId={idea.id}
                    votes={idea.votes}
                    variant="ledger"
                    kind="idea"
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="font-t-display text-[17px] leading-[1.3] font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
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
                    <p className="mt-[3px] line-clamp-2 text-[13.5px] text-muted-foreground [overflow-wrap:anywhere]">
                      {idea.preview}
                    </p>
                  ) : null}
                  <div
                    className={cn(
                      "mt-1.5 flex flex-wrap gap-x-3 gap-y-1",
                      !idea.objective && "md:hidden",
                    )}
                  >
                    <span className="md:hidden">
                      <StatusChip status={idea.status} />
                    </span>
                    {idea.objective ? (
                      <span className="inline-flex items-center gap-2 font-t-mono text-[11px] font-semibold tracking-[0.12em] text-ink3 uppercase">
                        <ObjectiveMark color={idea.objective.color} />
                        {idea.objective.name}
                      </span>
                    ) : null}
                    {commentsEnabled ? (
                      <span className="md:hidden">
                        <Talk count={idea.comments} />
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="hidden md:block">
                  <StatusChip status={idea.status} />
                </div>
                <div className="hidden justify-end md:flex">
                  {commentsEnabled ? <Talk count={idea.comments} /> : null}
                </div>
              </article>
            ))}
          </div>
        ) : mine.length && !query && !status ? null : (
          <div className="flex flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-rule2 px-6 py-12 text-center">
            <Lightbulb strokeWidth={1.8} className="size-6 text-ink3" />
            <p className="font-t-display text-lg font-semibold">
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
        className="sticky top-[88px] hidden self-start overflow-hidden rounded-[20px] bg-sheet ring-1 ring-border lg:block"
      >
        <FormHead />
        <div className="px-[22px] pt-[18px] pb-[22px]">{form}</div>
      </aside>

      <DetailSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Share an idea"
        description="The team reads every idea."
        ticket
        fit
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FormHead />
          <div className="px-5 pt-[18px] pb-[max(22px,env(safe-area-inset-bottom))]">
            {formOpen ? form : null}
          </div>
        </div>
      </DetailSheet>

      <DetailSheet
        open={!!open}
        onClose={close}
        title={open?.title ?? ""}
        description="Idea"
        ticket
      >
        {open ? (
          <IdeaDetail
            key={open.id}
            idea={open}
            commentsEnabled={commentsEnabled}
            followsEnabled={followsEnabled}
            inSheet
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}

/** The form ticket's head, above its dashed edge. */
function FormHead() {
  return (
    <div className="border-b-2 border-dashed border-rule2 px-5 pt-5 pb-4 lg:px-[22px]">
      <div className="font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase">
        New idea
      </div>
      <h2 className="mt-1.5 pr-10 font-t-display text-[22px] font-bold tracking-[-0.02em]">
        Tell us what you need
      </h2>
    </div>
  );
}

function Talk({ count }: { count: number }) {
  return (
    <span
      title="Comments"
      className="inline-flex items-center gap-1.5 font-t-mono text-[13px] font-semibold text-ink3"
    >
      <MessageSquare strokeWidth={1.8} className="size-4" />
      {count}
    </span>
  );
}
