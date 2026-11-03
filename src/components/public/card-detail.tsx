"use client";

import { Calendar, Lightbulb, MessageSquare, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { type StationKey, stampText } from "@/lib/stations";
import { cn } from "@/lib/utils";
import type { PublicCard } from "@/server/services/public-site";
import {
  CommentCompose,
  type Comments,
  CommentThread,
  useComments,
} from "./public-comments";
import { VoteButton } from "./vote-button";

/**
 * The card as a ticket (doc 32): stamp, title, meta, the big vote button
 * above a perforated edge; then the description, features, files, the ideas
 * it was requested in and the conversation, with the reply box pinned at the
 * bottom. Shared by the board's drawer / phone sheet and the card page.
 */
export function CardDetail({
  card,
  station,
  commentsEnabled,
  ideasBase,
  inSheet = false,
}: {
  card: PublicCard;
  /** The card's station on the line (from its column). */
  station: StationKey;
  commentsEnabled: boolean;
  /** Link base for "Requested in" ideas (null when Ideas is switched off). */
  ideasBase?: string | null;
  /** In the drawer / sheet: the body scrolls, the notches show the scrim. */
  inSheet?: boolean;
}) {
  return (
    <Ticket
      head={
        <>
          <Stamp>{stampText(station)}</Stamp>
          <h1 className="mt-4 mb-2.5 pr-10 font-t-display text-[25px] leading-[1.1] font-bold tracking-[-0.025em] md:text-[28px]">
            {card.title}
          </h1>
          <Meta>
            {card.plannedFor ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar strokeWidth={1.8} className="size-4" />
                ETA{" "}
                {new Date(`${card.plannedFor}T00:00:00`).toLocaleDateString(
                  "en",
                  { month: "short", year: "numeric" },
                )}
              </span>
            ) : null}
            {commentsEnabled ? (
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare strokeWidth={1.8} className="size-4" />
                {card.comments} {card.comments === 1 ? "comment" : "comments"}
              </span>
            ) : null}
            {card.objective ? <span>{card.objective.name}</span> : null}
          </Meta>
          <VoteButton cardId={card.id} votes={card.votes} variant="ticket" />
        </>
      }
      image={card.image}
      inSheet={inSheet}
      comments={commentsEnabled ? { cardId: card.id } : null}
    >
      {card.html ? (
        <div
          className="rich-text text-[15.5px] leading-[1.65] text-muted-foreground"
          // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
          dangerouslySetInnerHTML={{ __html: card.html }}
        />
      ) : null}

      {card.tags.length ? (
        <>
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-2">
            {card.tags.map((t) => (
              <span
                key={t}
                className="inline-flex h-7 items-center rounded-full px-3 text-[13px] text-muted-foreground ring-1 ring-rule2 ring-inset"
              >
                {t}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {card.progress || card.features?.length ? (
        <>
          <Label>
            {card.progress
              ? `Features · ${card.progress.done}/${card.progress.total} done`
              : "Features"}
          </Label>
          {card.progress ? (
            <div className="mb-3 h-1 rounded-full bg-paper">
              <div
                className="h-1 rounded-full bg-primary"
                style={{
                  width: `${Math.round((card.progress.done / card.progress.total) * 100)}%`,
                }}
              />
            </div>
          ) : null}
          <ul className="flex flex-col gap-2 text-[14.5px]">
            {(card.features ?? []).map((f) => (
              <li key={f.title} className="flex items-center gap-2.5">
                <span
                  className={
                    f.done
                      ? "size-3.5 rounded-full bg-primary"
                      : "size-3.5 rounded-full ring-1 ring-rule2 ring-inset"
                  }
                />
                <span className={f.done ? "text-ink3 line-through" : ""}>
                  {f.title}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {card.attachments?.length ? (
        <>
          <Label>Attachments</Label>
          <div className="flex flex-col gap-2">
            {card.attachments.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl bg-paper px-3.5 py-3 text-[14.5px] hover:text-primary"
              >
                <Paperclip strokeWidth={1.8} className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{a.name}</span>
              </a>
            ))}
          </div>
        </>
      ) : null}

      {card.requestedIn?.length ? (
        <>
          <Label>Requested in</Label>
          <div className="flex flex-col gap-2">
            {card.requestedIn.map((i) => (
              <From
                key={i.slug}
                href={ideasBase ? `${ideasBase}/${i.slug}` : null}
                title={i.title}
                votes={i.votes}
              />
            ))}
          </div>
        </>
      ) : null}
    </Ticket>
  );
}

/**
 * The ticket frame, also used by the idea ticket: head above a dashed,
 * notched edge; a body (scrolling in a sheet); the pinned reply box when
 * comments are on (decision 14).
 */
export function Ticket({
  head,
  image,
  inSheet,
  comments,
  children,
}: {
  head: ReactNode;
  image?: string | null;
  inSheet: boolean;
  comments: { cardId: string } | { feedbackId: string } | null;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex flex-col",
        inSheet
          ? "min-h-0 flex-1"
          : "overflow-hidden rounded-[22px] bg-sheet ring-1 ring-border",
      )}
    >
      {comments ? (
        <WithComments
          target={comments}
          inSheet={inSheet}
          head={head}
          image={image}
        >
          {children}
        </WithComments>
      ) : (
        <>
          <Head image={image} inSheet={inSheet}>
            {head}
          </Head>
          <Body inSheet={inSheet}>{children}</Body>
        </>
      )}
    </article>
  );
}

function WithComments({
  target,
  inSheet,
  head,
  image,
  children,
}: {
  target: { cardId: string } | { feedbackId: string };
  inSheet: boolean;
  head: ReactNode;
  image?: string | null;
  children: ReactNode;
}) {
  const comments = useComments(target);
  return (
    <>
      <Head image={image} inSheet={inSheet}>
        {head}
      </Head>
      <Body inSheet={inSheet}>
        {children}
        <Label>Conversation</Label>
        <CommentThread comments={comments} />
      </Body>
      <Compose comments={comments} />
    </>
  );
}

function Compose({ comments }: { comments: Comments }) {
  return (
    <CommentCompose
      comments={comments}
      className="shrink-0 border-t px-5 pt-3.5 pb-[max(30px,env(safe-area-inset-bottom))] md:pb-[18px]"
    />
  );
}

function Head({
  image,
  inSheet,
  children,
}: {
  image?: string | null;
  inSheet: boolean;
  children: ReactNode;
}) {
  return (
    <header
      className={cn(
        "relative shrink-0 border-b-2 border-dashed border-rule2 px-5 pt-[26px] pb-5 md:px-7 md:pb-[22px]",
        // The perforation's notches: the scrim in a sheet, the paper on a page.
        "before:absolute before:-bottom-[13px] before:-left-3 before:size-6 before:rounded-full after:absolute after:-right-3 after:-bottom-[13px] after:size-6 after:rounded-full",
        inSheet
          ? "before:bg-[rgba(8,10,14,.45)] after:bg-[rgba(8,10,14,.45)]"
          : "before:bg-paper after:bg-paper",
      )}
    >
      {image ? (
        // biome-ignore lint/performance/noImgElement: tenant uploads on any host
        <img
          src={image}
          alt=""
          className="mb-5 aspect-[3/1] w-full rounded-xl object-cover"
        />
      ) : null}
      {children}
    </header>
  );
}

function Body({
  inSheet,
  children,
}: {
  inSheet: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-5 pt-[18px] pb-6 md:px-7 md:pt-6",
        inSheet && "min-h-0 flex-1 overflow-y-auto",
      )}
    >
      {children}
    </div>
  );
}

/** The rotated brand stamp: "● Now · in progress". */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[26px] -rotate-2 items-center gap-[7px] rounded-md px-2.5 font-t-mono text-[11px] font-bold tracking-[0.14em] text-primary uppercase shadow-[inset_0_0_0_1.5px_var(--primary)]">
      <span aria-hidden>●</span>
      <span>{children}</span>
    </span>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-4 font-t-mono text-[12.5px] font-medium text-ink3">
      {children}
    </div>
  );
}

/** A small-caps section label inside the ticket body. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-[22px] mb-2.5 font-t-mono text-[11px] font-bold tracking-[0.14em] text-ink3 uppercase first:mt-0">
      {children}
    </h2>
  );
}

/** A "Requested in" row: 💡, idea title, votes. */
export function From({
  href,
  title,
  votes,
}: {
  href: string | null;
  title: string;
  votes: number;
}) {
  const body = (
    <>
      <Lightbulb strokeWidth={1.8} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <b className="font-t-mono text-sm font-bold">{votes}</b>
    </>
  );
  const row =
    "flex items-center gap-3 rounded-xl bg-paper px-3.5 py-3 text-[14.5px]";
  return href ? (
    <a href={href} className={cn(row, "hover:text-primary")}>
      {body}
    </a>
  ) : (
    <span className={row}>{body}</span>
  );
}
