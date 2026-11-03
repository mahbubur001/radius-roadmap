"use client";

import {
  Calendar,
  Check,
  Lightbulb,
  MessageSquare,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ColumnStage } from "@/lib/stages";
import { cn } from "@/lib/utils";
import type { PublicCard } from "@/server/services/public-site";
import { CardDetail } from "./card-detail";
import { DetailSheet } from "./detail-sheet";
import { VoteButton } from "./vote-button";

type Column = { id: string; name: string; isDone: boolean; stage: ColumnStage };

type StationKey = "now" | "next" | "later" | "done";

/** The four stops of the line (doc 32 decision 2): stages, in travel order. */
const STATIONS: {
  key: StationKey;
  label: string;
  sub: string;
  holds: (c: Column) => boolean;
}[] = [
  {
    key: "now",
    label: "Now",
    sub: "In progress",
    holds: (c) => !c.isDone && c.stage === "in_progress",
  },
  {
    key: "next",
    label: "Next",
    sub: "Planned",
    holds: (c) => !c.isDone && c.stage === "planned",
  },
  {
    key: "later",
    label: "Later",
    sub: "Considering",
    holds: (c) => !c.isDone && c.stage === "review",
  },
  { key: "done", label: "Shipped", sub: "Done", holds: (c) => c.isDone },
];

/** Shipped shows the latest few, then "+N more shipped" (decision 5). */
const SHIPPED_SHOWN = 3;

const pad = (n: number) => String(n).padStart(2, "0");

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

/**
 * The public roadmap as one line (doc 32 "Transit"): stations for Now, Next,
 * Later and Shipped with carriage cards under each; vertical on phones. Each
 * card's title is a real link (crawlable card page) stretched over the card;
 * a plain click opens it in a drawer and updates the URL instead.
 */
export function PublicBoard({
  columns,
  cards,
  cardHref,
  query,
  embed,
  commentsEnabled,
  ideasBase,
  searchAction,
  board,
}: {
  /** Link base for the ideas a card was requested in. */
  ideasBase?: string | null;
  columns: Column[];
  cards: PublicCard[];
  /** Base path for card links, e.g. "/classified-listing/roadmap". */
  cardHref: string;
  query: string;
  embed: boolean;
  /** Public comments are on for this workspace (doc 20 D3). */
  commentsEnabled: boolean;
  /** Where the search form goes (the roadmap page). */
  searchAction: string;
  /** The roadmap's slug when it isn't the default one (kept on search). */
  board?: string;
}) {
  const [open, setOpen] = useState<PublicCard | null>(null);
  const [tab, setTab] = useState<"details" | "comments">("details");
  const [topic, setTopic] = useState<string | null>(null);
  const [allShipped, setAllShipped] = useState(false);

  // Back button closes the drawer.
  useEffect(() => {
    const onPop = () => setOpen(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Topic chips are the roadmap's objectives (decision 4).
  const topics = useMemo(
    () => [
      ...new Set(cards.flatMap((c) => (c.objective ? [c.objective.name] : []))),
    ],
    [cards],
  );
  const shown = topic
    ? cards.filter((c) => c.objective?.name === topic)
    : cards;

  const stations = STATIONS.map((station) => {
    const own = columns.filter(station.holds);
    const ids = new Set(own.map((c) => c.id));
    return {
      ...station,
      columns: own,
      cards: shown.filter((c) => ids.has(c.columnId)),
    };
  }).filter((s) => s.cards.length > 0);

  function href(card: PublicCard) {
    return `${cardHref}/${card.slug}${embed ? "?embed=1" : ""}`;
  }

  function openCard(card: PublicCard) {
    setOpen(card);
    setTab("details");
    window.history.pushState({ card: card.id }, "", href(card));
  }

  function close() {
    setOpen(null);
    if (window.history.state?.card) window.history.back();
  }

  return (
    <>
      <div className="mb-[22px] flex items-center gap-2.5">
        <form
          action={searchAction}
          className="flex h-10 flex-1 items-center gap-2 rounded-full bg-sheet px-3.5 text-ink3 ring-1 ring-border focus-within:ring-2 focus-within:ring-ring md:w-[280px] md:flex-none"
        >
          <Search strokeWidth={1.8} className="size-4 shrink-0" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search the roadmap"
            aria-label="Search the roadmap"
            className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-ink3"
          />
          {board ? <input type="hidden" name="board" value={board} /> : null}
          {embed ? <input type="hidden" name="embed" value="1" /> : null}
        </form>
        {topics.length ? (
          <>
            <span className="hidden flex-1 md:block" />
            <div className="hidden flex-wrap justify-end gap-2.5 md:flex">
              <Chip on={topic === null} onClick={() => setTopic(null)}>
                All
              </Chip>
              {topics.map((t) => (
                <Chip key={t} on={topic === t} onClick={() => setTopic(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {stations.length === 0 ? (
        <p className="pb-16 text-ink3">
          {query
            ? `Nothing matches “${query}”.`
            : "Nothing on the roadmap yet."}
        </p>
      ) : (
        <div
          className="relative grid grid-cols-1 pb-6 pl-11 before:absolute before:top-1.5 before:bottom-[30px] before:left-[13px] before:w-1 before:rounded-sm before:bg-[linear-gradient(180deg,var(--primary)_0_40%,color-mix(in_oklab,var(--primary)_30%,transparent)_40%)] md:grid-cols-[repeat(var(--stations),minmax(0,1fr))] md:gap-[22px] md:pb-16 md:pl-0 md:before:top-[13px] md:before:right-0 md:before:bottom-auto md:before:left-0 md:before:h-1 md:before:w-auto md:before:bg-[linear-gradient(90deg,var(--primary)_0_50%,color-mix(in_oklab,var(--primary)_30%,transparent)_50%)]"
          style={{ ["--stations" as string]: stations.length }}
        >
          {stations.map((station) => {
            const many = station.columns.length > 1;
            const list =
              station.key === "done" && !allShipped
                ? station.cards.slice(0, SHIPPED_SHOWN)
                : station.cards;
            const more = station.cards.length - list.length;
            return (
              <section
                key={station.key}
                aria-label={
                  many
                    ? station.label
                    : (station.columns[0]?.name ?? station.label)
                }
                className="relative pb-[22px] md:pb-0"
              >
                <div className="sticky top-14 z-[3] mr-[-18px] mb-3 ml-[-44px] flex items-center gap-3 bg-paper/92 py-2.5 pr-[18px] backdrop-blur-sm md:static md:m-0 md:mb-[18px] md:flex-col md:items-start md:gap-2.5 md:bg-transparent md:p-0 md:backdrop-blur-none">
                  <Node stage={station.key} />
                  <h2 className="flex items-baseline gap-2.5">
                    <span className="font-t-mono text-[13px] font-bold tracking-[0.12em] uppercase">
                      {station.label}
                    </span>
                    <span className="text-[13px] text-ink3">
                      {many
                        ? station.sub
                        : (station.columns[0]?.name ?? station.sub)}
                    </span>
                    <span className="rounded-full px-[7px] py-px font-t-mono text-xs font-bold text-ink3 ring-1 ring-rule2 ring-inset">
                      {pad(station.cards.length)}
                    </span>
                  </h2>
                </div>
                <div className="flex flex-col gap-3">
                  {list.map((card) => (
                    <Car
                      key={card.id}
                      card={card}
                      href={href(card)}
                      shipped={station.key === "done"}
                      column={
                        many
                          ? station.columns.find((c) => c.id === card.columnId)
                              ?.name
                          : undefined
                      }
                      commentsEnabled={commentsEnabled}
                      onOpen={() => openCard(card)}
                    />
                  ))}
                  {more > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAllShipped(true)}
                      className="px-1 py-1.5 text-left font-t-mono text-xs font-semibold tracking-[0.1em] text-ink3 uppercase hover:text-foreground"
                    >
                      + {more} more shipped →
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <DetailSheet
        open={!!open}
        onClose={close}
        title={open?.title ?? ""}
        description="Roadmap card"
      >
        {open ? (
          <CardDetail
            key={`${open.id}-${tab}`}
            initialTab={tab}
            card={open}
            columnName={columns.find((c) => c.id === open.columnId)?.name ?? ""}
            commentsEnabled={commentsEnabled}
            ideasBase={ideasBase}
          />
        ) : null}
      </DetailSheet>
    </>
  );
}

/** A preview-style chip (`.chip`); also used for boards and filters. */
export function Chip({
  on,
  onClick,
  href,
  children,
}: {
  on: boolean;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const className = cn(
    "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium",
    on
      ? "bg-foreground text-background"
      : "text-muted-foreground ring-1 ring-rule2 ring-inset hover:text-foreground",
  );
  return href ? (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
}

function Node({ stage }: { stage: StationKey }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-[30px] shrink-0 place-items-center rounded-full",
        stage === "done"
          ? "bg-primary text-white"
          : "bg-paper shadow-[inset_0_0_0_4px_var(--primary)]",
        stage === "later" &&
          "shadow-[inset_0_0_0_4px_color-mix(in_oklab,var(--primary)_35%,transparent)]",
        stage === "now" &&
          "animate-[transit-pulse_2.4s_infinite] after:absolute after:inset-2 after:rounded-full after:bg-primary",
      )}
    >
      {stage === "done" ? <Check strokeWidth={1.8} className="size-4" /> : null}
    </span>
  );
}

function Car({
  card,
  href,
  shipped,
  column,
  commentsEnabled,
  onOpen,
}: {
  card: PublicCard;
  href: string;
  shipped: boolean;
  /** The card's column, when its station holds several (decision 2). */
  column?: string;
  commentsEnabled: boolean;
  onOpen: () => void;
}) {
  const tag = [card.objective?.name, column].filter(Boolean).join(" · ");
  return (
    <article className="relative grid grid-cols-[52px_1fr] gap-3.5 overflow-hidden rounded-2xl bg-sheet p-3.5 ring-1 ring-border transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-20px_rgba(0,0,0,.35)] hover:ring-rule2 md:grid-cols-[56px_1fr] md:p-4">
      {card.image ? (
        // biome-ignore lint/performance/noImgElement: tenant uploads on any host
        <img
          src={card.image}
          alt=""
          loading="lazy"
          className="col-span-2 -mx-3.5 -mt-3.5 aspect-[3/1] w-[calc(100%+1.75rem)] max-w-none object-cover md:-mx-4 md:-mt-4 md:w-[calc(100%+2rem)]"
        />
      ) : null}
      <div className="relative z-10">
        <VoteButton cardId={card.id} votes={card.votes} variant="car" />
      </div>
      <div className="min-w-0">
        {tag ? (
          <div className="font-t-mono text-[10.5px] font-semibold tracking-[0.12em] text-ink3 uppercase">
            {tag}
          </div>
        ) : null}
        <h3
          className={cn(
            "mt-[5px] mb-1.5 font-t-display text-[16.5px] leading-[1.25] font-semibold tracking-[-0.01em]",
            shipped && "text-muted-foreground",
          )}
        >
          <a
            href={href}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
                return;
              }
              e.preventDefault();
              onOpen();
            }}
            className="outline-none after:absolute after:inset-0 focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {card.title}
          </a>
        </h3>
        {card.preview ? (
          <p className="line-clamp-2 text-[13.5px] text-muted-foreground">
            {card.preview}
          </p>
        ) : null}
        {card.progress ? (
          <div className="mt-2.5 flex items-center gap-2 font-t-mono text-xs text-ink3">
            <div className="h-1 flex-1 rounded-full bg-paper">
              <div
                className="h-1 rounded-full bg-primary"
                style={{
                  width: `${Math.round((card.progress.done / card.progress.total) * 100)}%`,
                }}
              />
            </div>
            {card.progress.done}/{card.progress.total}
          </div>
        ) : null}
        {card.plannedFor || commentsEnabled || card.ideas ? (
          <div className="mt-2.5 flex gap-3.5 font-t-mono text-xs font-medium text-ink3">
            {card.plannedFor ? (
              <span className="inline-flex items-center gap-[5px]">
                <Calendar strokeWidth={1.8} className="size-[13px]" />
                {shortDate(card.plannedFor)}
              </span>
            ) : null}
            {commentsEnabled ? (
              <span
                className="inline-flex items-center gap-[5px]"
                title="Comments"
              >
                <MessageSquare strokeWidth={1.8} className="size-[13px]" />
                {card.comments}
              </span>
            ) : null}
            {card.ideas ? (
              <span
                role="img"
                aria-label={`Requested by your users (${card.ideas})`}
                className="inline-flex items-center gap-[5px]"
                title="Requested by your users"
              >
                <Lightbulb strokeWidth={1.8} className="size-[13px]" />
                {card.ideas}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
