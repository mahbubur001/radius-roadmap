"use client";

import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronUp,
  Circle,
  Copy,
  CopyPlus,
  ExternalLink,
  MoveRight,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  addFeatureAction,
  cardTargetsAction,
  deleteCardAction,
  deleteFeatureAction,
  duplicateCardAction,
  getCardAction,
  setCardArchivedAction,
  setCardCompletedAction,
  setCardFollowAction,
  transferCardAction,
  updateCardAction,
  updateFeatureAction,
} from "@/app/(dashboard)/_actions/roadmap";
import { TagPicker } from "@/components/dashboard/tag-picker";
import {
  autosaveLabel,
  useAutosave,
} from "@/components/dashboard/use-autosave";
import { VotersList } from "@/components/dashboard/voters-list";
import { DatePicker } from "@/components/form/date-picker";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UpdateCardInput } from "@/lib/schemas/roadmap";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Attachments, Comments } from "./card-activity-tabs";
import { ObjectivePicker } from "./objective-picker";
import type { BoardCard, ObjectiveOption, TagOption } from "./types";

type Detail = Extract<
  Awaited<ReturnType<typeof getCardAction>>,
  { ok: true }
>["data"];
type Patch = Omit<UpdateCardInput, "id">;

export function CardDrawer({
  workspace,
  workspaceId,
  cardId,
  publicUrl,
  objectives,
  tags,
  onClose,
  onOpenCard,
  onChanged,
  onRemoved,
  onTagCreated,
  onCreateObjective,
}: {
  workspace: string;
  workspaceId: string;
  cardId: string | null;
  publicUrl: string;
  objectives: ObjectiveOption[];
  tags: TagOption[];
  onClose: () => void;
  onOpenCard: (id: string) => void;
  onChanged: (id: string, change: Partial<BoardCard>) => void;
  onRemoved: (id: string) => void;
  onTagCreated: (tag: TagOption) => void;
  onCreateObjective?: (name: string) => Promise<ObjectiveOption | null>;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    setDetail(null);
    if (!cardId) return;
    let live = true;
    getCardAction({ workspace, id: cardId }).then((result) => {
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
  }, [workspace, cardId, onClose]);

  return (
    <Sheet open={!!cardId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-5xl">
        {detail ? (
          <CardEditor
            key={detail.card.id}
            detail={detail}
            workspace={workspace}
            workspaceId={workspaceId}
            publicUrl={publicUrl}
            objectives={objectives}
            tags={tags}
            onClose={onClose}
            onOpenCard={onOpenCard}
            onChanged={onChanged}
            onRemoved={onRemoved}
            onTagCreated={onTagCreated}
            onCreateObjective={onCreateObjective}
          />
        ) : (
          <div className="flex flex-col gap-4 p-8">
            <SheetHeader className="p-0">
              <SheetTitle>Loading card…</SheetTitle>
              <SheetDescription className="sr-only">Loading</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CardEditor({
  detail,
  workspace,
  workspaceId,
  publicUrl,
  objectives,
  tags,
  onClose,
  onOpenCard,
  onChanged,
  onRemoved,
  onTagCreated,
  onCreateObjective,
}: {
  detail: Detail;
  workspace: string;
  workspaceId: string;
  publicUrl: string;
  objectives: ObjectiveOption[];
  tags: TagOption[];
  onClose: () => void;
  onOpenCard: (id: string) => void;
  onChanged: (id: string, change: Partial<BoardCard>) => void;
  onRemoved: (id: string) => void;
  onTagCreated: (tag: TagOption) => void;
  onCreateObjective?: (name: string) => Promise<ObjectiveOption | null>;
}) {
  const router = useRouter();
  const { card } = detail;
  const [title, setTitle] = useState(card.title);
  const [publicTitle, setPublicTitle] = useState(card.publicTitle ?? "");
  const [objectiveId, setObjectiveId] = useState(card.objectiveId);
  const [plannedFor, setPlannedFor] = useState(card.plannedFor);
  const [isPublic, setIsPublic] = useState(card.isPublic);
  const [tagIds, setTagIds] = useState(card.tagIds);
  const [completed, setCompleted] = useState(!!card.completedAt);
  const [archived, setArchived] = useState(!!card.archivedAt);
  const [features, setFeatures] = useState(card.features);
  const [attachments, setAttachments] = useState(detail.attachments);
  const [comments, setComments] = useState(detail.comments);
  const [following, setFollowing] = useState(detail.followers.following);
  const [updatedAt, setUpdatedAt] = useState(new Date(card.updatedAt));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transfer, setTransfer] = useState<"move" | "copy" | null>(null);
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    async (patch: Patch) => {
      const result = await updateCardAction({
        workspace,
        id: card.id,
        ...patch,
      });
      if (!result.ok) toast.error(result.error);
      else setUpdatedAt(new Date(result.data.updatedAt));
      return result.ok;
    },
    [workspace, card.id],
  );
  const { schedule, flush, status } = useAutosave<Patch>(save);

  // Save whatever is pending when the drawer closes.
  useEffect(() => () => void flush(), [flush]);

  function change(patch: Patch, board?: Partial<BoardCard>) {
    schedule(patch);
    if (board) onChanged(card.id, board);
  }

  const doneCount = features.filter((f) => f.done).length;
  const votes = card.voteCount + card.importedVotes;
  const cardUrl = `${publicUrl}/${card.slug}`;

  async function flag(
    run: typeof setCardCompletedAction,
    value: boolean,
    apply: () => void,
  ) {
    const result = await run({ workspace, id: card.id, value });
    if (!result.ok) return toast.error(result.error);
    apply();
  }

  async function duplicate() {
    setBusy(true);
    await flush();
    const result = await duplicateCardAction({ workspace, id: card.id });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Card duplicated.");
    router.refresh();
    onOpenCard(result.data.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <SheetHeader className="gap-3 px-8 pt-6 pb-2">
            <SheetTitle className="sr-only">Edit card</SheetTitle>
            <SheetDescription className="sr-only">
              Changes save automatically.
            </SheetDescription>
            <ObjectivePicker
              objectives={objectives}
              value={objectiveId}
              onChange={(next) => {
                setObjectiveId(next);
                change({ objectiveId: next }, { objectiveId: next });
              }}
              onCreate={onCreateObjective}
              className="self-start"
            />
            <div className="flex items-center gap-4">
              <span
                className="flex size-14 shrink-0 flex-col items-center justify-center rounded-md border text-lg font-semibold"
                title="Votes"
              >
                <ChevronUp className="size-4 text-muted-foreground" />
                {votes}
              </span>
              <Input
                aria-label="Title"
                className="h-auto border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) {
                    change(
                      { title: e.target.value },
                      { title: e.target.value },
                    );
                  }
                }}
              />
            </div>
            {completed || archived ? (
              <div className="flex gap-2">
                {completed ? (
                  <Badge variant="secondary">Completed</Badge>
                ) : null}
                {archived ? <Badge variant="outline">Archived</Badge> : null}
              </div>
            ) : null}
          </SheetHeader>

          <Tabs defaultValue="general" className="gap-0">
            <TabsList
              variant="line"
              className="h-auto w-full justify-start gap-4 rounded-none border-b px-8"
            >
              <TabsTrigger value="general" className={TAB}>
                General
              </TabsTrigger>
              <TabsTrigger value="features" className={TAB}>
                Features (
                {features.length
                  ? `${doneCount}/${features.length}`
                  : features.length}
                )
              </TabsTrigger>
              <TabsTrigger value="feedback" className={TAB}>
                Linked feedback ({detail.feedback.length})
              </TabsTrigger>
              <TabsTrigger value="attachments" className={TAB}>
                Attachments ({attachments.length})
              </TabsTrigger>
              <TabsTrigger value="votes" className={TAB}>
                Votes ({votes})
              </TabsTrigger>
              <TabsTrigger value="comments" className={TAB}>
                Comments ({comments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="general"
              className="flex flex-col gap-5 px-8 py-6"
            >
              <div className="flex flex-col gap-2">
                <Label>Summary</Label>
                <RichTextEditor
                  label="Summary"
                  workspaceId={workspaceId}
                  value={card.summaryJson as RichTextValue}
                  onChange={(summaryJson) => change({ summaryJson })}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="card-public-title">Public title</Label>
                <Input
                  id="card-public-title"
                  placeholder="Same as the title"
                  value={publicTitle}
                  onChange={(e) => {
                    setPublicTitle(e.target.value);
                    change(
                      { publicTitle: e.target.value },
                      { publicTitle: e.target.value.trim() || null },
                    );
                  }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="card-visibility">Public visibility</Label>
                <Select
                  value={isPublic ? "public" : "private"}
                  onValueChange={(v) => {
                    const next = v === "public";
                    setIsPublic(next);
                    change({ isPublic: next }, { isPublic: next });
                  }}
                >
                  <SelectTrigger id="card-visibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private (team only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="card-objective">Objective</Label>
                <ObjectivePicker
                  id="card-objective"
                  variant="field"
                  objectives={objectives}
                  value={objectiveId}
                  onChange={(next) => {
                    setObjectiveId(next);
                    change({ objectiveId: next }, { objectiveId: next });
                  }}
                  onCreate={onCreateObjective}
                />
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="card-planned">Planned for</Label>
                <DatePicker
                  id="card-planned"
                  value={plannedFor}
                  placeholder="Planned for"
                  onChange={(next) => {
                    setPlannedFor(next);
                    change({ plannedFor: next }, { plannedFor: next });
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="features" className="px-8 py-6">
              <Features
                workspace={workspace}
                cardId={card.id}
                features={features}
                onChange={(next) => {
                  setFeatures(next);
                  onChanged(card.id, {
                    features: {
                      done: next.filter((f) => f.done).length,
                      total: next.length,
                    },
                  });
                }}
              />
            </TabsContent>

            <TabsContent value="feedback" className="px-8 py-6">
              <LinkedFeedback workspace={workspace} items={detail.feedback} />
            </TabsContent>

            <TabsContent value="attachments" className="px-8 py-6">
              <Attachments
                workspace={workspace}
                cardId={card.id}
                items={attachments}
                onChange={(next) => {
                  setAttachments(next);
                  onChanged(card.id, { attachments: next.length });
                }}
              />
            </TabsContent>

            <TabsContent value="votes" className="px-8 py-6">
              <VotersList voters={detail.voters} />
            </TabsContent>

            <TabsContent value="comments" className="px-8 py-6">
              <Comments
                workspace={workspace}
                cardId={card.id}
                items={comments}
                me={detail.me}
                canModerate={detail.canModerate}
                onChange={(next) => {
                  setComments(next);
                  onChanged(card.id, { comments: next.length });
                }}
              />
            </TabsContent>
          </Tabs>
        </div>

        <footer
          className="flex items-center gap-2 border-t bg-muted/40 px-8 py-2.5 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span
            className={cn(
              "size-2 rounded-full",
              status === "error" ? "bg-destructive" : "bg-emerald-500",
            )}
          />
          {autosaveLabel(status) || "All changes saved"}
          <span suppressHydrationWarning>· Last updated {ago(updatedAt)}</span>
        </footer>
      </div>

      <aside
        aria-label="More options"
        className="flex w-full shrink-0 flex-col gap-2 border-t bg-muted/40 p-5 sm:w-64 sm:border-t-0 sm:border-l"
      >
        <h2 className="pr-8 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          More options
        </h2>
        <RailButton
          onClick={() =>
            flag(setCardCompletedAction, !completed, () => {
              setCompleted(!completed);
              onChanged(card.id, { completed: !completed });
            })
          }
        >
          {completed ? <Circle /> : <CheckCircle2 />}
          {completed ? "Reopen" : "Mark as complete"}
        </RailButton>
        <RailButton
          aria-pressed={following}
          onClick={async () => {
            const next = !following;
            setFollowing(next);
            const result = await setCardFollowAction({
              workspace,
              id: card.id,
              value: next,
            });
            if (!result.ok) {
              setFollowing(!next);
              return toast.error(result.error);
            }
            // Others' follows + mine.
            const others =
              detail.followers.count - (detail.followers.following ? 1 : 0);
            onChanged(card.id, { followers: others + (next ? 1 : 0) });
          }}
        >
          {following ? <BellOff /> : <Bell />}
          {following ? "Unfollow" : "Follow"}
        </RailButton>
        <RailButton onClick={() => setTransfer("move")}>
          <MoveRight />
          Move to…
        </RailButton>
        <RailButton onClick={() => setTransfer("copy")}>
          <Copy />
          Copy to…
        </RailButton>
        <RailButton disabled={busy} onClick={duplicate}>
          <CopyPlus />
          Duplicate card
        </RailButton>
        <Separator className="my-1" />
        <Button variant="secondary" className="w-full" asChild>
          <a href={cardUrl} target="_blank" rel="noreferrer">
            <ExternalLink />
            View public card
          </a>
        </Button>
        <RailButton
          onClick={() =>
            flag(setCardArchivedAction, !archived, () => {
              setArchived(!archived);
              if (!archived) {
                onRemoved(card.id);
                toast.success("Card archived.");
                onClose();
              }
            })
          }
        >
          {archived ? <ArchiveRestore /> : <Archive />}
          {archived ? "Restore" : "Archive"}
        </RailButton>
        <RailButton onClick={() => setConfirmDelete(true)}>
          <Trash2 />
          Delete card
        </RailButton>

        <dl className="mt-auto flex flex-col gap-3 pt-6 text-sm">
          <div>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Submitted by
            </dt>
            <dd>{card.createdByName ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Created
            </dt>
            <dd suppressHydrationWarning>{ago(new Date(card.createdAt))}</dd>
          </div>
        </dl>
      </aside>

      <TransferDialog
        mode={transfer}
        workspace={workspace}
        cardId={card.id}
        currentColumnId={card.columnId}
        onClose={() => setTransfer(null)}
        onDone={async (columnId, mode) => {
          await flush();
          const result = await transferCardAction({
            workspace,
            id: card.id,
            columnId,
            mode,
          });
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          router.refresh();
          if (mode === "copy") {
            toast.success("Card copied.");
          } else {
            toast.success("Card moved.");
            if (result.data.roadmapId !== card.roadmapId) {
              onRemoved(card.id);
              onClose();
            }
          }
          return true;
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this card?</AlertDialogTitle>
            <AlertDialogDescription>
              The card, its features and its votes are deleted for good. Archive
              it instead to keep its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const result = await deleteCardAction({
                  workspace,
                  id: card.id,
                });
                if (!result.ok) return toast.error(result.error);
                onRemoved(card.id);
                toast.success("Card deleted.");
                onClose();
              }}
            >
              Delete card
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Underlined tab in the drawer, like LoopedIn. */
const TAB =
  "flex-none rounded-none border-0 border-b-2 border-transparent px-1 pt-2 pb-2.5 data-active:border-foreground";

function RailButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="secondary" className="w-full" {...props} />;
}

type Targets = Extract<
  Awaited<ReturnType<typeof cardTargetsAction>>,
  { ok: true }
>["data"];

/** "Move to…" / "Copy to…": pick a roadmap and a column. */
function TransferDialog({
  mode,
  workspace,
  cardId,
  currentColumnId,
  onClose,
  onDone,
}: {
  mode: "move" | "copy" | null;
  workspace: string;
  cardId: string;
  currentColumnId: string;
  onClose: () => void;
  onDone: (columnId: string, mode: "move" | "copy") => Promise<boolean>;
}) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [roadmapId, setRoadmapId] = useState("");
  const [columnId, setColumnId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mode) return;
    let live = true;
    cardTargetsAction({ workspace, id: cardId }).then((result) => {
      if (!live) return;
      if (!result.ok) return toast.error(result.error);
      setTargets(result.data);
      const current = result.data.find((r) =>
        r.columns.some((c) => c.id === currentColumnId),
      );
      setRoadmapId(current?.id ?? result.data[0]?.id ?? "");
      setColumnId(currentColumnId);
    });
    return () => {
      live = false;
    };
  }, [mode, workspace, cardId, currentColumnId]);

  const columns = targets?.find((r) => r.id === roadmapId)?.columns ?? [];
  const verb = mode === "copy" ? "Copy" : "Move";

  return (
    <Dialog open={!!mode} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{verb} card</DialogTitle>
          <DialogDescription>
            {mode === "copy"
              ? "A copy with the same content, objective, tags and features. Votes stay on the original."
              : "The card keeps its votes, features and linked feedback."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-roadmap">Roadmap</Label>
            <Select
              value={roadmapId}
              onValueChange={(id) => {
                setRoadmapId(id);
                setColumnId(
                  targets?.find((r) => r.id === id)?.columns[0]?.id ?? "",
                );
              }}
            >
              <SelectTrigger id="transfer-roadmap" className="w-full">
                <SelectValue placeholder="Loading…" />
              </SelectTrigger>
              <SelectContent>
                {targets?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-column">Column</Label>
            <Select value={columnId} onValueChange={setColumnId}>
              <SelectTrigger id="transfer-column" className="w-full">
                <SelectValue placeholder="Pick a column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={
              !mode ||
              !columnId ||
              saving ||
              (mode === "move" && columnId === currentColumnId)
            }
            onClick={async () => {
              if (!mode) return;
              setSaving(true);
              const ok = await onDone(columnId, mode);
              setSaving(false);
              if (ok) onClose();
            }}
          >
            {verb} card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Feature = Detail["card"]["features"][number];

function Features({
  workspace,
  cardId,
  features,
  onChange,
}: {
  workspace: string;
  cardId: string;
  features: Feature[];
  onChange: (features: Feature[]) => void;
}) {
  const [title, setTitle] = useState("");
  const done = features.filter((f) => f.done).length;

  async function add() {
    const value = title.trim();
    if (!value) return;
    const result = await addFeatureAction({ workspace, cardId, title: value });
    if (!result.ok) return toast.error(result.error);
    onChange([
      ...features,
      { id: result.data.id, title: value, done: false, position: "" },
    ]);
    setTitle("");
  }

  async function update(id: string, patch: { title?: string; done?: boolean }) {
    onChange(features.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const result = await updateFeatureAction({ workspace, id, ...patch });
    if (!result.ok) toast.error(result.error);
  }

  async function remove(id: string) {
    const result = await deleteFeatureAction({ workspace, id });
    if (!result.ok) return toast.error(result.error);
    onChange(features.filter((f) => f.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      {features.length ? (
        <div className="flex items-center gap-3">
          <Progress
            value={(done / features.length) * 100}
            aria-label="Features done"
          />
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {done} of {features.length}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Break this card into features. Progress shows on the board and the
          public roadmap.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {features.map((f) => (
          <li key={f.id} className="group flex items-center gap-2">
            <Checkbox
              checked={f.done}
              aria-label={`Done: ${f.title}`}
              onCheckedChange={(on) => update(f.id, { done: on === true })}
            />
            <Input
              defaultValue={f.title}
              aria-label="Feature title"
              className="h-8 border-transparent shadow-none hover:border-input"
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== f.title) update(f.id, { title: value });
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Delete feature ${f.title}`}
              onClick={() => remove(f.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label="New feature"
          placeholder="Add a feature"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" variant="outline">
          Add
        </Button>
      </form>
    </div>
  );
}

/** Feedback pushed to or linked with this card (doc 20 §1). */
function LinkedFeedback({
  workspace,
  items,
}: {
  workspace: string;
  items: Detail["feedback"];
}) {
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No feedback is linked yet. Use “Push to roadmap” or “Add to roadmap
        card” on a feedback item.
      </p>
    );
  }
  const total = items.reduce((sum, f) => sum + f.votes, 0);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">
        {items.length} {items.length === 1 ? "request" : "requests"} · {total}{" "}
        {total === 1 ? "vote" : "votes"}
      </p>
      <ul className="flex flex-col divide-y rounded-md border">
        {items.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-3 py-2">
            <span className="w-8 shrink-0 text-center font-medium">
              {f.votes}
            </span>
            <Link
              href={`/dashboard/${workspace}/feedback?state=all&feedback=${f.id}`}
              className="min-w-0 flex-1 truncate hover:underline"
            >
              {f.title}
            </Link>
            {f.review === "pending" ? (
              <Badge variant="secondary">Waiting for review</Badge>
            ) : null}
            {f.isPublic ? null : <Badge variant="outline">Private</Badge>}
          </li>
        ))}
      </ul>
    </div>
  );
}
