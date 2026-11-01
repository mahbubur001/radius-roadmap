"use client";

import { Lightbulb, MessagesSquare } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { PublicCard } from "@/server/services/public-site";
import { CardDetail } from "./card-detail";
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
}: {
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

      <div className="flex gap-6 overflow-x-auto pb-4">
        {columns.map((column) => {
          const items = cards.filter((c) => c.columnId === column.id);
          return (
            <section
              key={column.id}
              aria-label={column.name}
              className="flex w-80 shrink-0 flex-col gap-3"
            >
              <h2 className="flex items-center gap-2 text-lg font-medium">
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
                      {card.objective ? (
                        <span className="flex w-fit items-center gap-1.5 rounded border px-2 py-0.5 text-xs">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: card.objective.color }}
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
                        <VoteButton cardId={card.id} votes={card.votes} />
                        {commentsEnabled ? (
                          <>
                            <span className="h-4 w-px bg-border" />
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

      <Sheet open={!!open} onOpenChange={(next) => !next && close()}>
        <SheetContent className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{open?.title}</SheetTitle>
            <SheetDescription>Roadmap card</SheetDescription>
          </SheetHeader>
          {open ? (
            <CardDetail
              key={`${open.id}-${tab}`}
              initialTab={tab}
              card={open}
              columnName={
                columns.find((c) => c.id === open.columnId)?.name ?? ""
              }
              commentsEnabled={commentsEnabled}
            />
          ) : null}
        </SheetContent>
      </Sheet>
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
