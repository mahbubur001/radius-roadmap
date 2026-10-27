"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { PublicCard } from "@/server/services/public-site";
import { CardDetail } from "./card-detail";
import { VoteButton } from "./vote-button";

type Column = { id: string; name: string; isDone: boolean };

/**
 * The public roadmap board. Cards are real links (crawlable card pages);
 * a plain click opens them in a drawer and updates the URL instead.
 */
export function PublicBoard({
  columns,
  cards,
  cardHref,
  showCompletedToggle,
  query,
  searchAction,
  embed,
}: {
  columns: Column[];
  cards: PublicCard[];
  /** Base path for card links, e.g. "/classified-listing/roadmap". */
  cardHref: string;
  showCompletedToggle: boolean;
  query: string;
  searchAction: string;
  embed: boolean;
}) {
  const [showCompleted, setShowCompleted] = useState(true);
  const [open, setOpen] = useState<PublicCard | null>(null);

  // Back button closes the drawer.
  useEffect(() => {
    const onPop = () => setOpen(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function href(card: PublicCard) {
    return `${cardHref}/${card.slug}${embed ? "?embed=1" : ""}`;
  }

  function openCard(card: PublicCard) {
    setOpen(card);
    window.history.pushState({ card: card.id }, "", href(card));
  }

  function close() {
    setOpen(null);
    if (window.history.state?.card) window.history.back();
  }

  const visible = (card: PublicCard) => showCompleted || !card.completed;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <search>
          <form action={searchAction} className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={query}
              aria-label="Search the roadmap"
              placeholder="Search"
              className="w-60 pl-8"
            />
            {embed ? <input type="hidden" name="embed" value="1" /> : null}
          </form>
        </search>
        {showCompletedToggle ? (
          <Label className="flex items-center gap-2 font-normal">
            <Switch
              checked={showCompleted}
              onCheckedChange={setShowCompleted}
            />
            Show completed
          </Label>
        ) : null}
      </div>

      {query && cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing matches “{query}”.
        </p>
      ) : null}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => {
          const items = cards.filter(
            (c) => c.columnId === column.id && visible(c),
          );
          return (
            <section
              key={column.id}
              aria-label={column.name}
              className="flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2"
            >
              <h2 className="flex items-center gap-2 px-1 py-1 text-sm font-medium">
                {column.name}
                <span className="text-xs text-muted-foreground">
                  {items.length}
                </span>
              </h2>
              {items.map((card) => (
                <a
                  key={card.id}
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
                  className="flex gap-3 overflow-hidden rounded-md border bg-card p-3 text-card-foreground shadow-xs transition-colors hover:border-ring"
                  style={
                    card.category
                      ? { borderTop: `3px solid ${card.category.color}` }
                      : undefined
                  }
                >
                  <VoteButton cardId={card.id} votes={card.votes} />
                  <div className="flex min-w-0 flex-col gap-1">
                    {card.category ? (
                      <span className="text-xs text-muted-foreground">
                        {card.category.name}
                      </span>
                    ) : null}
                    <h3
                      className={cn(
                        "text-sm font-medium leading-snug",
                        card.completed && "text-muted-foreground",
                      )}
                    >
                      {card.title}
                    </h3>
                    {card.preview ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {card.preview}
                      </p>
                    ) : null}
                    {card.features?.length ? (
                      <div className="mt-1 h-1 rounded-full bg-muted">
                        <div
                          className="h-1 rounded-full bg-primary"
                          style={{
                            width: `${Math.round(
                              (card.features.filter((f) => f.done).length /
                                card.features.length) *
                                100,
                            )}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </a>
              ))}
            </section>
          );
        })}
      </div>

      <Sheet open={!!open} onOpenChange={(next) => !next && close()}>
        <SheetContent className="overflow-y-auto p-6 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{open?.title}</SheetTitle>
            <SheetDescription>Roadmap card</SheetDescription>
          </SheetHeader>
          {open ? (
            <CardDetail
              card={open}
              columnName={
                columns.find((c) => c.id === open.columnId)?.name ?? ""
              }
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
