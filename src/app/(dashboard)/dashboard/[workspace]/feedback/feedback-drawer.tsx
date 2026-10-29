"use client";

import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Circle,
  Copy,
  Link2,
  Map as MapIcon,
  Merge,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteFeedbackAction,
  duplicateFeedbackAction,
  getFeedbackAction,
  setFeedbackArchivedAction,
  setFeedbackCompletedAction,
  unlinkCardAction,
  updateFeedbackAction,
} from "@/app/(dashboard)/_actions/feedback";
import { CommentsPanel } from "@/components/dashboard/comments-panel";
import { TagPicker } from "@/components/dashboard/tag-picker";
import {
  autosaveLabel,
  useAutosave,
} from "@/components/dashboard/use-autosave";
import { VotersList } from "@/components/dashboard/voters-list";
import {
  RichTextEditor,
  type RichTextValue,
} from "@/components/form/rich-text-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PRIORITY_BUCKETS,
  priorityBucket,
  priorityScore,
  SIZES,
  type UpdateFeedbackInput,
} from "@/lib/schemas/feedback";
import {
  LinkCardDialog,
  MergeDialog,
  PushToRoadmapDialog,
} from "./feedback-link-dialogs";
import type {
  BoardOption,
  FeedbackRow,
  ObjectiveOption,
  StatusOption,
  TagOption,
} from "./types";

type Detail = Extract<
  Awaited<ReturnType<typeof getFeedbackAction>>,
  { ok: true }
>["data"];
type Patch = Omit<UpdateFeedbackInput, "id">;

const NONE = "none";

type Shared = {
  workspace: string;
  workspaceId: string;
  boards: BoardOption[];
  statuses: StatusOption[];
  objectives: ObjectiveOption[];
  tags: TagOption[];
  onClose: () => void;
  onChanged: (id: string, change: Partial<FeedbackRow>) => void;
  onRemoved: (id: string) => void;
  onTagCreated: (tag: TagOption) => void;
  /** Open another item (after merge or duplicate). */
  onOpenItem: (id: string) => void;
  /** Public comments are on (Public settings). */
  publicComments: boolean;
};

export function FeedbackDrawer({
  feedbackId,
  ...props
}: Shared & { feedbackId: string | null }) {
  const { workspace, onClose } = props;
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    setDetail(null);
    if (!feedbackId) return;
    let live = true;
    getFeedbackAction({ workspace, id: feedbackId }).then((result) => {
      if (!live) return;
      if (result.ok) setDetail(result.data);
      else {
        toast.error(result.error);
        onClose();
      }
    });
    return () => {
      live = false;
    };
  }, [workspace, feedbackId, onClose]);

  return (
    <Sheet open={!!feedbackId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {detail ? (
          <FeedbackEditor key={detail.item.id} detail={detail} {...props} />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <SheetHeader className="p-0">
              <SheetTitle>Loading feedback…</SheetTitle>
              <SheetDescription className="sr-only">Loading</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FeedbackEditor({
  detail,
  workspace,
  workspaceId,
  boards,
  statuses,
  objectives,
  tags,
  onClose,
  onChanged,
  onRemoved,
  onTagCreated,
  onOpenItem,
  publicComments,
}: Shared & { detail: Detail }) {
  const { item } = detail;
  const [cards, setCards] = useState(detail.cards);
  const [dialog, setDialog] = useState<"push" | "link" | "merge" | null>(null);
  const [title, setTitle] = useState(item.title);
  const [comments, setComments] = useState(detail.comments);
  const [boardId, setBoardId] = useState(item.boardId);
  const [statusId, setStatusId] = useState(item.statusId);
  const [objectiveId, setObjectiveId] = useState(item.objectiveId);
  const [isPublic, setIsPublic] = useState(item.isPublic);
  const [tagIds, setTagIds] = useState(item.tagIds);
  const [impact, setImpact] = useState(item.impact);
  const [effort, setEffort] = useState(item.effort);
  const [completed, setCompleted] = useState(!!item.completedAt);
  const [archived, setArchived] = useState(!!item.archivedAt);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useCallback(
    async (patch: Patch) => {
      const result = await updateFeedbackAction({
        workspace,
        id: item.id,
        ...patch,
      });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      setCompleted(result.data.completed);
      onChanged(item.id, { completed: result.data.completed });
      return true;
    },
    [workspace, item.id, onChanged],
  );
  const { schedule, flush, status } = useAutosave<Patch>(save);

  // Save whatever is pending when the drawer closes.
  useEffect(() => () => void flush(), [flush]);

  function change(patch: Patch, row?: Partial<FeedbackRow>) {
    schedule(patch);
    if (row) onChanged(item.id, row);
  }

  // Pushing, linking and unlinking can move the status (doc 20 D5).
  async function reloadLinks() {
    const result = await getFeedbackAction({ workspace, id: item.id });
    if (!result.ok) return;
    const next = result.data.item;
    setCards(result.data.cards);
    setStatusId(next.statusId);
    setCompleted(!!next.completedAt);
    onChanged(item.id, {
      statusId: next.statusId,
      completed: !!next.completedAt,
      linkedCards: result.data.cards.length,
    });
  }

  async function unlink(cardId: string) {
    const result = await unlinkCardAction({
      workspace,
      feedbackId: item.id,
      cardId,
    });
    if (!result.ok) return toast.error(result.error);
    await reloadLinks();
  }

  const score = priorityScore(impact, effort);
  const bucket = priorityBucket(score);

  return (
    <div className="flex flex-col">
      <SheetHeader className="flex-row items-center gap-2 border-b pr-12">
        <SheetTitle className="sr-only">Edit feedback</SheetTitle>
        <SheetDescription className="sr-only">
          Changes save automatically.
        </SheetDescription>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {autosaveLabel(status)}
        </span>
        {item.review === "pending" ? (
          <Badge variant="secondary">Waiting for review</Badge>
        ) : null}
        {completed ? <Badge variant="secondary">Completed</Badge> : null}
        {archived ? <Badge variant="outline">Archived</Badge> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label="Feedback actions"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog("push")}>
              <MapIcon />
              Push to roadmap…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("link")}>
              <Link2 />
              Add to roadmap card…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDialog("merge")}>
              <Merge />
              Merge into…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                const result = await duplicateFeedbackAction({
                  workspace,
                  id: item.id,
                });
                if (!result.ok) return toast.error(result.error);
                toast.success("Duplicated.");
                onOpenItem(result.data.id);
              }}
            >
              <Copy />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                const result = await setFeedbackCompletedAction({
                  workspace,
                  id: item.id,
                  value: !completed,
                });
                if (!result.ok) return toast.error(result.error);
                setCompleted(!completed);
                setStatusId(result.data.statusId);
                onChanged(item.id, {
                  completed: !completed,
                  statusId: result.data.statusId,
                });
              }}
            >
              {completed ? <Circle /> : <CheckCircle2 />}
              {completed ? "Reopen" : "Mark complete"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                const result = await setFeedbackArchivedAction({
                  workspace,
                  id: item.id,
                  value: !archived,
                });
                if (!result.ok) return toast.error(result.error);
                setArchived(!archived);
                if (!archived) {
                  onRemoved(item.id);
                  toast.success("Feedback archived.");
                  onClose();
                }
              }}
            >
              {archived ? <ArchiveRestore /> : <Archive />}
              {archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmDelete(true)}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SheetHeader>

      <div className="flex flex-col gap-4 p-4">
        <Input
          aria-label="Title"
          className="h-auto border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) {
              change({ title: e.target.value }, { title: e.target.value });
            }
          }}
        />

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="votes">
              Votes ({item.voteCount + item.importedVotes})
            </TabsTrigger>
            <TabsTrigger value="comments">
              Comments ({comments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="flex flex-col gap-4 pt-2">
            {cards.length ? (
              <section
                aria-label="On the roadmap"
                className="flex flex-col gap-2 rounded-md border p-3"
              >
                <h3 className="text-sm font-medium">On the roadmap</h3>
                <ul className="flex flex-col gap-1">
                  {cards.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <MapIcon className="size-4 shrink-0 text-muted-foreground" />
                      <Link
                        href={`/dashboard/${workspace}/roadmap?r=${c.roadmapSlug}&card=${c.id}`}
                        className="min-w-0 flex-1 truncate hover:underline"
                      >
                        {c.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.roadmapTitle} · {c.columnName}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Unlink ${c.title}`}
                        onClick={() => unlink(c.id)}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label>Description</Label>
              <RichTextEditor
                label="Description"
                workspaceId={workspaceId}
                value={item.summaryJson as RichTextValue}
                onChange={(summaryJson) => change({ summaryJson })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="feedback-status">Status</Label>
                <Select
                  value={statusId}
                  onValueChange={(v) => {
                    setStatusId(v);
                    change({ statusId: v }, { statusId: v });
                  }}
                >
                  <SelectTrigger id="feedback-status" className="w-full">
                    <SelectValue />
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
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="feedback-objective">Objective</Label>
                <Select
                  value={objectiveId ?? NONE}
                  onValueChange={(v) => {
                    const next = v === NONE ? null : v;
                    setObjectiveId(next);
                    change({ objectiveId: next }, { objectiveId: next });
                  }}
                >
                  <SelectTrigger id="feedback-objective" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No objective</SelectItem>
                    {objectives.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {boards.length > 1 ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="feedback-board">Board</Label>
                  <Select
                    value={boardId}
                    onValueChange={(v) => {
                      setBoardId(v);
                      change({ boardId: v });
                      onRemoved(item.id);
                      toast.success("Moved to another board.");
                    }}
                  >
                    <SelectTrigger id="feedback-board" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {boards.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <TagPicker
              workspace={workspace}
              tags={tags}
              selected={tagIds}
              onChange={(next) => {
                setTagIds(next);
                change({ tagIds: next }, { tagIds: next });
              }}
              onCreated={onTagCreated}
            />

            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Priority</Label>
                <span className="text-sm text-muted-foreground">
                  {bucket
                    ? `${PRIORITY_BUCKETS[bucket].label} · ${score}`
                    : "Set impact and effort"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SizeSelect
                  id="feedback-impact"
                  label="Impact"
                  value={impact}
                  onChange={(v) => {
                    setImpact(v);
                    change(
                      { impact: v },
                      { impact: v, priority: priorityScore(v, effort) },
                    );
                  }}
                />
                <SizeSelect
                  id="feedback-effort"
                  label="Effort"
                  value={effort}
                  onChange={(v) => {
                    setEffort(v);
                    change(
                      { effort: v },
                      { effort: v, priority: priorityScore(impact, v) },
                    );
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="feedback-public">
                  Show on the public board
                </Label>
                <p className="text-xs text-muted-foreground">
                  Private feedback is visible to your team only.
                </p>
              </div>
              <Switch
                id="feedback-public"
                checked={isPublic}
                onCheckedChange={(v) => {
                  setIsPublic(v);
                  change({ isPublic: v }, { isPublic: v });
                }}
              />
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Submitted by</dt>
              <dd>
                {item.author
                  ? `${item.author.name || item.author.email}${
                      item.author.team ? " (team)" : ""
                    }${item.author.kind === "guest" ? " · guest (unverified)" : ""}`
                  : "Unknown"}
                {item.author?.email && item.author.name ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {item.author.email}
                  </span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{new Date(item.createdAt).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{new Date(item.updatedAt).toLocaleString()}</dd>
            </dl>
          </TabsContent>

          <TabsContent value="votes" className="pt-2">
            <VotersList voters={detail.voters} />
          </TabsContent>

          <TabsContent value="comments" className="pt-2">
            <CommentsPanel
              workspace={workspace}
              target={{ feedbackId: item.id }}
              items={comments}
              me={detail.me}
              canModerate={detail.canModerate}
              publicComments={publicComments}
              onChange={(next) => {
                setComments(next);
                onChanged(item.id, {
                  comments: next.filter((c) => !c.internal && !c.pending)
                    .length,
                });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      <PushToRoadmapDialog
        open={dialog === "push"}
        onOpenChange={(open) => setDialog(open ? "push" : null)}
        workspace={workspace}
        feedbackId={item.id}
        defaultTitle={title}
        onDone={reloadLinks}
      />
      <LinkCardDialog
        open={dialog === "link"}
        onOpenChange={(open) => setDialog(open ? "link" : null)}
        workspace={workspace}
        feedbackId={item.id}
        onDone={reloadLinks}
      />
      <MergeDialog
        open={dialog === "merge"}
        onOpenChange={(open) => setDialog(open ? "merge" : null)}
        workspace={workspace}
        feedbackId={item.id}
        onMerged={(targetId) => {
          onRemoved(item.id);
          onOpenItem(targetId);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              The item and its votes are deleted for good. Archive it instead to
              keep its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const result = await deleteFeedbackAction({
                  workspace,
                  id: item.id,
                });
                if (!result.ok) return toast.error(result.error);
                onRemoved(item.id);
                toast.success("Feedback deleted.");
                onClose();
              }}
            >
              Delete feedback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SizeSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value ? String(value) : NONE}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {SIZES.map((s, i) => (
            <SelectItem key={s} value={String(i + 1)}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
