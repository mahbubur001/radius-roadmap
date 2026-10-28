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
  CategoryOption,
  FeedbackRow,
  StatusOption,
} from "./types";

const NONE = "none";

export function FeedbackRowItem({
  item,
  status,
  category,
  board,
  selected,
  focused,
  onSelect,
  onOpen,
}: {
  item: FeedbackRow;
  status?: StatusOption;
  category?: CategoryOption | null;
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
        "flex items-start gap-3 p-3 hover:bg-muted/50",
        (selected || focused) && "bg-muted/50",
        focused && "ring-2 ring-ring/50 ring-inset",
      )}
    >
      <Checkbox
        className="mt-3"
        checked={selected}
        aria-label={`Select ${item.title}`}
        onCheckedChange={(on) => onSelect(on === true)}
      />
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none"
      >
        <span className="flex w-12 shrink-0 flex-col items-center rounded-md border py-1 text-sm font-medium">
          <ChevronUp className="size-4 text-muted-foreground" />
          {item.votes}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {status ? (
              <Badge
                variant="outline"
                className="gap-1.5"
                style={{ borderColor: status.color }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                {status.name}
              </Badge>
            ) : null}
            {item.review === "pending" ? (
              <Badge variant="secondary">Waiting for review</Badge>
            ) : null}
            {item.review === "rejected" ? (
              <Badge variant="outline">Rejected</Badge>
            ) : null}
            {item.isPublic ? null : <Badge variant="outline">Private</Badge>}
            {item.archived ? <Badge variant="outline">Archived</Badge> : null}
            {board ? (
              <span className="text-xs text-muted-foreground">
                {board.name}
              </span>
            ) : null}
            {category ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                {category.name}
              </span>
            ) : null}
          </span>
          <span className="truncate font-medium">{item.title}</span>
          {item.summaryText ? (
            <span className="line-clamp-1 text-sm text-muted-foreground">
              {item.summaryText}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <span suppressHydrationWarning>{ago(new Date(item.updatedAt))}</span>
          <span className="flex items-center gap-2">
            {bucket ? (
              <Badge variant="secondary">
                {PRIORITY_BUCKETS[bucket].label} · {item.priority}
              </Badge>
            ) : null}
            {item.linkedCards ? (
              <span
                className="flex items-center gap-0.5"
                title="Linked to a roadmap card"
              >
                <Lightbulb className="size-3.5" />
                {item.linkedCards}
              </span>
            ) : null}
            {item.comments ? (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="size-3.5" />
                {item.comments}
              </span>
            ) : null}
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
  categories,
  busy,
  onReview,
  onStatus,
  onCategory,
  onClear,
}: {
  count: number;
  inbox: boolean;
  statuses: StatusOption[];
  categories: CategoryOption[];
  busy: boolean;
  onReview: (action: ReviewAction) => void;
  onStatus: (statusId: string) => void;
  onCategory: (categoryId: string | null) => void;
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
        onValueChange={(v) => onCategory(v === NONE ? null : v)}
        disabled={busy}
      >
        <SelectTrigger size="sm" aria-label="Set category" className="w-40">
          <SelectValue placeholder="Set category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No category</SelectItem>
          {categories.map((c) => (
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
