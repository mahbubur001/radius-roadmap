"use client";

import { ChevronUp, Lightbulb, MessageSquare, X } from "lucide-react";
import { StageTick } from "@/components/dashboard/stage-tick";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRIORITY_BUCKETS,
  priorityBucket,
  type ReviewAction,
} from "@/lib/schemas/feedback";
import { feedbackStage } from "@/lib/stages";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";
import type {
  BoardOption,
  FeedbackRow,
  ObjectiveOption,
  StatusOption,
} from "./types";

const NONE = "none";

export function FeedbackRowItem({
  item,
  status,
  objective,
  board,
  selected,
  focused,
  open,
  onSelect,
  onOpen,
}: {
  item: FeedbackRow;
  status?: StatusOption;
  objective?: ObjectiveOption | null;
  /** Shown in the inbox, which spans every board. */
  board?: BoardOption;
  selected: boolean;
  focused: boolean;
  /** Showing in the detail pane beside the list. */
  open: boolean;
  onSelect: (selected: boolean) => void;
  onOpen: () => void;
}) {
  const bucket = priorityBucket(item.priority);
  const stage = status
    ? feedbackStage({
        review: item.review,
        kind: status.kind,
        announced: item.announced,
      })
    : null;
  return (
    <li
      data-feedback-row={item.id}
      className={cn(
        "group relative flex items-start gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/60",
        (selected || open) && "bg-accent",
        focused && "bg-muted/60",
        open &&
          "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-foreground",
      )}
    >
      <Checkbox
        className={cn(
          "mt-0.5 transition-opacity",
          !selected &&
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
        checked={selected}
        aria-label={`Select ${item.title}`}
        onCheckedChange={(on) => onSelect(on === true)}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-current={open ? "true" : undefined}
        className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <StageTick stage={stage} />
            <span className="truncate text-[13.5px] leading-snug font-medium">
              {item.title}
            </span>
            {item.review === "pending" ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-signal"
                title="Waiting for review"
              />
            ) : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-faint">
            {status ? <span>{status.name}</span> : null}
            {board ? <span>· {board.name}</span> : null}
            {objective ? (
              <span className="flex items-center gap-1">
                ·
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: objective.color }}
                />
                {objective.name}
              </span>
            ) : null}
            {item.isPublic ? null : <span>· Private</span>}
            {item.review === "pending" ? (
              <span>· Waiting for review</span>
            ) : null}
            {item.review === "rejected" ? <span>· Rejected</span> : null}
            {item.archived ? <span>· Archived</span> : null}
            <span suppressHydrationWarning>
              · {ago(new Date(item.updatedAt))}
            </span>
            {bucket ? (
              <span>
                · {PRIORITY_BUCKETS[bucket].label} {item.priority}
              </span>
            ) : null}
            {item.linkedCards ? (
              <span
                className="flex items-center gap-0.5"
                title="Linked to a roadmap card"
              >
                · <Lightbulb className="size-3" />
                {item.linkedCards}
              </span>
            ) : null}
            {item.comments ? (
              <span className="flex items-center gap-0.5" title="Comments">
                · <MessageSquare className="size-3" />
                {item.comments}
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_var(--input)]">
          <ChevronUp className="size-3 text-faint" />
          {item.votes}
        </span>
      </button>
    </li>
  );
}

/** Actions for the selected rows. Review actions only show in the inbox. */
export function BulkBar({
  count,
  inbox,
  statuses,
  objectives,
  busy,
  onReview,
  onStatus,
  onObjective,
  onClear,
}: {
  count: number;
  inbox: boolean;
  statuses: StatusOption[];
  objectives: ObjectiveOption[];
  busy: boolean;
  onReview: (action: ReviewAction) => void;
  onStatus: (statusId: string) => void;
  onObjective: (objectiveId: string | null) => void;
  onClear: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-2.5 py-2 text-sm"
    >
      <span className="font-medium">{count} selected</span>
      {inbox ? (
        <>
          <Button size="sm" disabled={busy} onClick={() => onReview("approve")}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onReview("keep_private")}
          >
            Keep private
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onReview("reject")}
          >
            Reject
          </Button>
        </>
      ) : null}
      <Select value="" onValueChange={onStatus} disabled={busy}>
        <SelectTrigger size="sm" aria-label="Set status" className="w-36">
          <SelectValue placeholder="Set status" />
        </SelectTrigger>
        <SelectContent>
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
      <Select
        value=""
        onValueChange={(v) => onObjective(v === NONE ? null : v)}
        disabled={busy}
      >
        <SelectTrigger size="sm" aria-label="Set objective" className="w-40">
          <SelectValue placeholder="Set objective" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No objective</SelectItem>
          {objectives.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X />
        Clear
      </Button>
    </div>
  );
}
