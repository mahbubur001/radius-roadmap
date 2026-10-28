"use client";

import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Circle,
  Link as LinkIcon,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  addFeatureAction,
  deleteCardAction,
  deleteFeatureAction,
  getCardAction,
  setCardArchivedAction,
  setCardCompletedAction,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { UpdateCardInput } from "@/lib/schemas/roadmap";
import type { BoardCard, CategoryOption, TagOption } from "./types";

type Detail = Extract<
  Awaited<ReturnType<typeof getCardAction>>,
  { ok: true }
>["data"];
type Patch = Omit<UpdateCardInput, "id">;

const NO_CATEGORY = "none";

export function CardDrawer({
  workspace,
  workspaceId,
  cardId,
  publicUrl,
  categories,
  tags,
  onClose,
  onChanged,
  onRemoved,
  onTagCreated,
}: {
  workspace: string;
  workspaceId: string;
  cardId: string | null;
  publicUrl: string;
  categories: CategoryOption[];
  tags: TagOption[];
  onClose: () => void;
  onChanged: (id: string, change: Partial<BoardCard>) => void;
  onRemoved: (id: string) => void;
  onTagCreated: (tag: TagOption) => void;
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
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {detail ? (
          <CardEditor
            key={detail.card.id}
            detail={detail}
            workspace={workspace}
            workspaceId={workspaceId}
            publicUrl={publicUrl}
            categories={categories}
            tags={tags}
            onClose={onClose}
            onChanged={onChanged}
            onRemoved={onRemoved}
            onTagCreated={onTagCreated}
          />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <SheetHeader className="p-0">
              <SheetTitle>Loading card…</SheetTitle>
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

function CardEditor({
  detail,
  workspace,
  workspaceId,
  publicUrl,
  categories,
  tags,
  onClose,
  onChanged,
  onRemoved,
  onTagCreated,
}: {
  detail: Detail;
  workspace: string;
  workspaceId: string;
  publicUrl: string;
  categories: CategoryOption[];
  tags: TagOption[];
  onClose: () => void;
  onChanged: (id: string, change: Partial<BoardCard>) => void;
  onRemoved: (id: string) => void;
  onTagCreated: (tag: TagOption) => void;
}) {
  const { card } = detail;
  const [title, setTitle] = useState(card.title);
  const [publicTitle, setPublicTitle] = useState(card.publicTitle ?? "");
  const [categoryId, setCategoryId] = useState(card.categoryId);
  const [plannedFor, setPlannedFor] = useState(card.plannedFor);
  const [isPublic, setIsPublic] = useState(card.isPublic);
  const [tagIds, setTagIds] = useState(card.tagIds);
  const [completed, setCompleted] = useState(!!card.completedAt);
  const [archived, setArchived] = useState(!!card.archivedAt);
  const [features, setFeatures] = useState(card.features);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useCallback(
    async (patch: Patch) => {
      const result = await updateCardAction({
        workspace,
        id: card.id,
        ...patch,
      });
      if (!result.ok) toast.error(result.error);
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

  return (
    <div className="flex flex-col">
      <SheetHeader className="flex-row items-center gap-2 border-b pr-12">
        <SheetTitle className="sr-only">Edit card</SheetTitle>
        <SheetDescription className="sr-only">
          Changes save automatically.
        </SheetDescription>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {autosaveLabel(status)}
        </span>
        {completed ? <Badge variant="secondary">Completed</Badge> : null}
        {archived ? <Badge variant="outline">Archived</Badge> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label="Card actions"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                flag(setCardCompletedAction, !completed, () => {
                  setCompleted(!completed);
                  onChanged(card.id, { completed: !completed });
                })
              }
            >
              {completed ? <Circle /> : <CheckCircle2 />}
              {completed ? "Reopen" : "Mark complete"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
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
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(cardUrl);
                toast.success("Public link copied.");
              }}
            >
              <LinkIcon />
              Copy public link
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
            <TabsTrigger value="features">
              Features{" "}
              {features.length ? `(${doneCount}/${features.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="votes">
              Votes ({card.voteCount + card.importedVotes})
            </TabsTrigger>
            <TabsTrigger value="feedback">
              Linked feedback ({detail.feedback.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="flex flex-col gap-4 pt-2">
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
              <Label>Description</Label>
              <RichTextEditor
                label="Description"
                workspaceId={workspaceId}
                value={card.summaryJson as RichTextValue}
                onChange={(summaryJson) => change({ summaryJson })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="card-category">Category</Label>
                <Select
                  value={categoryId ?? NO_CATEGORY}
                  onValueChange={(v) => {
                    const next = v === NO_CATEGORY ? null : v;
                    setCategoryId(next);
                    change({ categoryId: next }, { categoryId: next });
                  }}
                >
                  <SelectTrigger id="card-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                    {categories.map((c) => (
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="card-planned">Planned for</Label>
                <DatePicker
                  id="card-planned"
                  value={plannedFor}
                  placeholder="No date"
                  onChange={(next) => {
                    setPlannedFor(next);
                    change({ plannedFor: next }, { plannedFor: next });
                  }}
                />
              </div>
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

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="card-public">Show on the public roadmap</Label>
                <p className="text-xs text-muted-foreground">
                  Private cards are visible to your team only.
                </p>
              </div>
              <Switch
                id="card-public"
                checked={isPublic}
                onCheckedChange={(v) => {
                  setIsPublic(v);
                  change({ isPublic: v }, { isPublic: v });
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="features" className="pt-2">
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

          <TabsContent value="votes" className="pt-2">
            <VotersList voters={detail.voters} />
          </TabsContent>

          <TabsContent value="feedback" className="pt-2">
            <LinkedFeedback workspace={workspace} items={detail.feedback} />
          </TabsContent>
        </Tabs>
      </div>

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
