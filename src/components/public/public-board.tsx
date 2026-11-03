"use client";

import { Lightbulb, MessagesSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { PHONE, useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import type { PublicCard } from "@/server/services/public-site";
import { CardDetail } from "./card-detail";
import { DetailSheet } from "./detail-sheet";
import { Hint } from "./hint";
import { VoteButton } from "./vote-button";

type Column = { id: string; name: string; isDone: boolean };

/**
 * The public roadmap board (doc 22 step 3). Each card's title is a real link
 * (crawlable card page) stretched over the card; a plain click opens it in a
 * drawer and updates the URL instead. The vote button sits above the link.
 */
export function PublicBoard({
  columns,
  cards,
  cardHref,
  query,
  embed,
  commentsEnabled,
  ideasBase,
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
}) {
  const [open, setOpen] = useState<PublicCard | null>(null);
  const phone = useMedia(PHONE);
  // Phones show one column at a time, picked with the chips (doc 31 M2).
  const [shown, setShown] = useState(
    () => columns.find((c) => !c.isDone)?.id ?? columns[0]?.id ?? "",
  );
  const [tab, setTab] = useState<"details" | "comments">("details");

  // Back button closes the drawer.
  useEffect(() => {
    const onPop = () => setOpen(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function href(card: PublicCard) {
    return `${cardHref}/${card.slug}${embed ? "?embed=1" : ""}`;
  }

  function openCard(card: PublicCard, on: "details" | "comments" = "details") {
    setOpen(card);
    setTab(on);
    window.history.pushState({ card: card.id }, "", href(card));
  }

  function close() {
    setOpen(null);
    if (window.history.state?.card) window.history.back();
  }

  return (
    <div className="flex flex-col gap-4">
      {query && cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing matches “{query}”.
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="Roadmap columns"
        className={cn(
          "sticky z-20 -mx-4 flex gap-1.5 overflow-x-auto bg-background/95 px-4 py-2.5 backdrop-blur [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden",
          // Below the sticky site header; embeds have no header.
          embed ? "top-0" : "top-[94px]",
        )}
      >
        {columns.map((column) => {
          const on = column.id === shown;
          return (
            <button
              key={column.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setShown(column.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                on
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {column.name}
              <span
                className={cn(
                  "text-xs font-semibold",
                  on ? "text-background/60" : "text-muted-foreground/70",
                )}
              >
                {cards.filter((c) => c.columnId === column.id).length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-6 pb-4 md:overflow-x-auto">
        {columns.map((column) => {
          const items = cards.filter((c) => c.columnId === column.id);
          return (
            <section
              key={column.id}
              aria-label={column.name}
              className={cn(
                "w-full shrink-0 flex-col gap-3 md:flex md:w-80",
                column.id === shown ? "flex" : "hidden",
              )}
            >
              <h2 className="hidden items-center gap-2 text-lg font-medium md:flex">
                {column.name}
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {items.length}
                </span>
              </h2>
              {items.length ? (
                <div className="flex flex-col divide-y overflow-hidden rounded-md border bg-card text-card-foreground shadow-xs">
                  {items.map((card) => (
                    <article
                      key={card.id}
                      className="relative flex flex-col gap-2.5 border-l-4 px-5 py-4 transition-colors hover:bg-muted/40"
                      style={{
                        borderLeftColor:
                          card.objective?.color ?? "var(--border)",
                      }}
                    >
                      {card.image ? (
                        // biome-ignore lint/performance/noImgElement: tenant uploads on any host
                        <img
                          src={card.image}
                          alt=""
                          loading="lazy"
                          className="-mx-5 -mt-4 mb-1 aspect-[3/1] w-[calc(100%+2.5rem)] max-w-none object-cover"
                        />
                      ) : null}
                      <div className="flex gap-3">
                        {phone ? (
                          <div className="relative z-10 pt-0.5">
                            <VoteButton
                              cardId={card.id}
                              votes={card.votes}
                              variant="box"
                            />
                          </div>
                        ) : null}
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                          {card.objective ? (
                            <span className="flex w-fit items-center gap-1.5 rounded border px-2 py-0.5 text-xs">
                              <span
                                className="size-2 rounded-full"
                                style={{
                                  backgroundColor: card.objective.color,
                                }}
                              />
                              {card.objective.name}
                            </span>
                          ) : null}
                          <h3
                            className={cn(
                              "font-medium leading-snug",
                              card.completed && "text-muted-foreground",
                            )}
                          >
                            <a
                              href={href(card)}
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
                                openCard(card);
                              }}
                              className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                            >
                              {card.title}
                            </a>
                          </h3>
                          {card.preview ? (
                            <p className="line-clamp-3 text-sm text-muted-foreground">
                              {card.preview}
                            </p>
                          ) : null}
                          {card.progress ? (
                            <FeatureBar progress={card.progress} />
                          ) : null}
                          <div className="relative z-10 flex items-center gap-3 text-sm text-muted-foreground">
                            {phone ? null : (
                              <VoteButton cardId={card.id} votes={card.votes} />
                            )}
                            {commentsEnabled ? (
                              <>
                                {phone ? null : (
                                  <span className="h-4 w-px bg-border" />
                                )}
                                <Hint label="Comments">
                                  <button
                                    type="button"
                                    aria-label={`Comments (${card.comments})`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openCard(card, "comments");
                                    }}
                                    className="-mx-1.5 flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                  >
                                    <MessagesSquare className="size-4" />
                                    {card.comments}
                                  </button>
                                </Hint>
                              </>
                            ) : null}
                            {card.ideas ? (
                              <Hint
                                label={`Requested by your users (${card.ideas})`}
                              >
                                <span
                                  // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users get the tooltip
                                  tabIndex={0}
                                  role="img"
                                  aria-label={`Requested by your users (${card.ideas})`}
                                  className="ml-auto flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <Lightbulb className="size-4" />
                                </span>
                              </Hint>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nothing here yet.
                </p>
              )}
            </section>
          );
        })}
      </div>

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
    </div>
  );
}

function FeatureBar({
  progress: { done, total },
}: {
  progress: NonNullable<PublicCard["progress"]>;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1 flex-1 rounded-full bg-muted">
        <div
          className="h-1 rounded-full bg-primary"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
      {done}/{total}
    </div>
  );
}
