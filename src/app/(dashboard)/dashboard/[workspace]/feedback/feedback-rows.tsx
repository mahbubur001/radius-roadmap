"use client";

import { ChevronUp, Lightbulb, MessageSquare, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  onSelect: (selected: boolean) => void;
  onOpen: () => void;
}) {
  const bucket = priorityBucket(item.priority);
  return (
    <li
      data-feedback-row={item.id}
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card p-4 shadow-xs hover:border-ring/50",
        selected && "border-ring/50 bg-muted/40",
        focused && "ring-2 ring-ring/50",
      )}
    >
      <Checkbox
        className="mt-4"
        checked={selected}
        aria-label={`Select ${item.title}`}
        onCheckedChange={(on) => onSelect(on === true)}
      />
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-4 text-left focus-visible:outline-none"
      >
        <span className="flex w-12 shrink-0 flex-col items-center rounded-md border bg-background py-1.5 text-sm font-semibold">
          <ChevronUp className="size-4 text-muted-foreground" />
          {item.votes}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {status ? (
              <span className="flex items-center gap-1.5 font-medium">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                {status.name}
              </span>
            ) : null}
            {item.isPublic ? null : (
              <span className="text-muted-foreground">Private</span>
            )}
            {item.review === "pending" ? (
              <Badge variant="secondary">Waiting for review</Badge>
            ) : null}
            {item.review === "rejected" ? (
              <Badge variant="outline">Rejected</Badge>
            ) : null}
            {item.archived ? <Badge variant="outline">Archived</Badge> : null}
            {board ? (
              <span className="text-muted-foreground">{board.name}</span>
            ) : null}
            {objective ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: objective.color }}
                />
                {objective.name}
              </span>
            ) : null}
          </span>
          <span className="truncate text-base font-semibold">{item.title}</span>
          {item.summaryText ? (
            <span className="line-clamp-2 text-sm text-muted-foreground">
              {item.summaryText}
            </span>
          ) : null}
          <span className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span suppressHydrationWarning>
              Last updated {ago(new Date(item.updatedAt))}
            </span>
            <span className="ml-auto flex items-center gap-3">
              {bucket ? (
                <Badge variant="secondary">
                  {PRIORITY_BUCKETS[bucket].label} · {item.priority}
                </Badge>
              ) : null}
              {item.linkedCards ? (
                <span
                  className="flex items-center gap-1"
                  title="Linked to a roadmap card"
                >
                  <Lightbulb className="size-3.5" />
                  {item.linkedCards}
                </span>
              ) : null}
              <span className="flex items-center gap-1" title="Comments">
                <MessageSquare className="size-3.5" />
                {item.comments}
              </span>
            </span>
          </span>
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
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
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
