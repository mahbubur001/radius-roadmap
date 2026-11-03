"use client";

import { Calendar, Map as MapIcon, MessageSquare } from "lucide-react";
import type { PublicIdea } from "@/server/services/public-ideas";
import { Label, Meta, Stamp, Ticket } from "./card-detail";
import { FollowButton } from "./follow-button";
import { VoteButton } from "./vote-button";

/**
 * One idea as a ticket (doc 32 decision 13), shared by the Ideas drawer /
 * phone sheet and the idea page. `tags` and `roadmapHref` are only known on
 * the full page.
 */
export function IdeaDetail({
  idea,
  commentsEnabled,
  followsEnabled,
  tags,
  roadmapHref,
  inSheet = false,
}: {
  idea: PublicIdea;
  commentsEnabled: boolean;
  followsEnabled: boolean;
  tags?: string[];
  roadmapHref?: string | null;
  /** In the drawer / sheet: the body scrolls, the notches show the scrim. */
  inSheet?: boolean;
}) {
  return (
    <Ticket
      inSheet={inSheet}
      comments={commentsEnabled ? { feedbackId: idea.id } : null}
      head={
        <>
          <Stamp>{idea.status.name}</Stamp>
          <h1 className="mt-4 mb-2.5 pr-10 font-t-display text-[25px] leading-[1.1] font-bold tracking-[-0.025em] md:text-[28px]">
            {idea.title}
          </h1>
          <Meta>
            <span className="inline-flex items-center gap-1.5">
              <Calendar strokeWidth={1.8} className="size-4" />
              {new Date(idea.createdAt).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {commentsEnabled ? (
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare strokeWidth={1.8} className="size-4" />
                {idea.comments} {idea.comments === 1 ? "comment" : "comments"}
              </span>
            ) : null}
            {idea.objective ? <span>{idea.objective.name}</span> : null}
          </Meta>
          <VoteButton
            cardId={idea.id}
            votes={idea.votes}
            variant="ticket"
            kind="idea"
          />
          {followsEnabled ? <FollowButton feedbackId={idea.id} /> : null}
        </>
      }
    >
      {idea.html ? (
        <div
          className="rich-text text-[15.5px] leading-[1.65] text-muted-foreground"
          // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
          dangerouslySetInnerHTML={{ __html: idea.html }}
        />
      ) : null}
      {tags?.length ? (
        <>
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
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
      {roadmapHref ? (
        <>
          <Label>On the roadmap</Label>
          <a
            href={roadmapHref}
            className="flex items-center gap-3 rounded-xl bg-paper px-3.5 py-3 text-[14.5px] hover:text-primary"
          >
            <MapIcon strokeWidth={1.8} className="size-4 shrink-0" />
            Planned on the roadmap
          </a>
        </>
      ) : null}
    </Ticket>
  );
}

/** An idea's status in the ledger: a small coloured square, small caps. */
export function StatusChip({ status }: { status: PublicIdea["status"] }) {
  return (
    <span className="inline-flex items-center gap-2 font-t-mono text-[11px] font-bold tracking-[0.12em] uppercase">
      <i
        aria-hidden
        className="size-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: status.color }}
      />
      {status.name}
    </span>
  );
}
