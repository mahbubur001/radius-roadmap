"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  linkCardAction,
  mergeFeedbackAction,
  pushToRoadmapAction,
  roadmapTargetsAction,
  searchCardsAction,
  searchFeedbackAction,
} from "@/app/(dashboard)/_actions/feedback";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Targets = Extract<
  Awaited<ReturnType<typeof roadmapTargetsAction>>,
  { ok: true }
>["data"];

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  feedbackId: string;
};

/** Create a roadmap card from this feedback (doc 20 §1 "Push to roadmap"). */
export function PushToRoadmapDialog({
  open,
  onOpenChange,
  workspace,
  feedbackId,
  defaultTitle,
  onDone,
}: DialogProps & { defaultTitle: string; onDone: () => void }) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [roadmapId, setRoadmapId] = useState("");
  const [columnId, setColumnId] = useState("");
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    let live = true;
    roadmapTargetsAction({ workspace }).then((result) => {
      if (!live) return;
      if (!result.ok) return toast.error(result.error);
      setTargets(result.data);
      const first = result.data[0];
      setRoadmapId(first?.id ?? "");
      setColumnId(first?.columns.find((c) => !c.isDone)?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [open, workspace, defaultTitle]);

  const roadmap = targets?.find((r) => r.id === roadmapId);

  async function submit() {
    if (!columnId || !title.trim()) return;
    setBusy(true);
    const result = await pushToRoadmapAction({
      workspace,
      feedbackId,
      columnId,
      title: title.trim(),
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Card created on the roadmap.");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Push to roadmap</DialogTitle>
            <DialogDescription>
              Creates a card linked to this feedback. The description and
              category are copied; the feedback moves to “Planned”.
            </DialogDescription>
          </DialogHeader>
          {targets && !targets.length ? (
            <p className="text-sm text-muted-foreground">
              This workspace has no roadmap yet.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="push-roadmap">Roadmap</Label>
                  <Select
                    value={roadmapId}
                    onValueChange={(v) => {
                      setRoadmapId(v);
                      const next = targets?.find((r) => r.id === v);
                      setColumnId(
                        next?.columns.find((c) => !c.isDone)?.id ?? "",
                      );
                    }}
                  >
                    <SelectTrigger id="push-roadmap" className="w-full">
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
                  <Label htmlFor="push-column">Column</Label>
                  <Select value={columnId} onValueChange={setColumnId}>
                    <SelectTrigger id="push-column" className="w-full">
                      <SelectValue placeholder="Pick a column" />
                    </SelectTrigger>
                    <SelectContent>
                      {roadmap?.columns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="push-title">Card title</Label>
                <Input
                  id="push-title"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !columnId || !title.trim()}>
              Create card
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Option = { id: string; title: string; detail: string };

/** Search box + result list shared by the two pickers below. */
function Picker({
  label,
  search,
  selected,
  onSelect,
}: {
  label: string;
  search: (q: string) => Promise<Option[]>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const found = await search(q.trim());
      if (live) setOptions(found);
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, search]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          type="search"
          aria-label={label}
          placeholder={label}
          className="pl-8"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>
      <ul
        className="flex max-h-72 flex-col overflow-y-auto rounded-md border"
        aria-label="Results"
      >
        {options === null ? (
          <li className="p-3 text-sm text-muted-foreground">Searching…</li>
        ) : options.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">Nothing found.</li>
        ) : (
          options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                aria-pressed={selected === o.id}
                onClick={() => onSelect(o.id)}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted",
                  selected === o.id && "bg-muted",
                )}
              >
                <span className="font-medium">{o.title}</span>
                <span className="text-xs text-muted-foreground">
                  {o.detail}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** Link this feedback to an existing roadmap card. */
export function LinkCardDialog({
  open,
  onOpenChange,
  workspace,
  feedbackId,
  onDone,
}: DialogProps & { onDone: () => void }) {
  const [cardId, setCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search] = useState(() => async (q: string) => {
    const result = await searchCardsAction({ workspace, q });
    if (!result.ok) return [];
    return result.data.map((c) => ({
      id: c.id,
      title: c.title,
      detail: `${c.roadmapTitle} · ${c.columnName}`,
    }));
  });

  async function submit() {
    if (!cardId) return;
    setBusy(true);
    const result = await linkCardAction({ workspace, feedbackId, cardId });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Linked to the roadmap card.");
    setCardId(null);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to roadmap card</DialogTitle>
          <DialogDescription>
            Link this feedback to a card that's already on the roadmap.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <Picker
            label="Search cards"
            search={search}
            selected={cardId}
            onSelect={setCardId}
          />
        ) : null}
        <DialogFooter>
          <Button disabled={busy || !cardId} onClick={submit}>
            Link card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Merge this feedback into another item (votes, followers, comments move). */
export function MergeDialog({
  open,
  onOpenChange,
  workspace,
  feedbackId,
  onMerged,
}: DialogProps & { onMerged: (targetId: string) => void }) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search] = useState(() => async (q: string) => {
    const result = await searchFeedbackAction({
      workspace,
      q,
      excludeId: feedbackId,
    });
    if (!result.ok) return [];
    return result.data.map((f) => ({
      id: f.id,
      title: f.title,
      detail: `${f.boardName} · ${f.votes} ${f.votes === 1 ? "vote" : "votes"}`,
    }));
  });

  async function submit() {
    if (!targetId) return;
    setBusy(true);
    const result = await mergeFeedbackAction({
      workspace,
      sourceId: feedbackId,
      targetId,
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Merged. Votes and followers moved over.");
    onOpenChange(false);
    onMerged(result.data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into…</DialogTitle>
          <DialogDescription>
            This item's votes, followers, comments and roadmap links move to the
            one you pick. This item is archived and its public page redirects
            there. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <Picker
            label="Search feedback"
            search={search}
            selected={targetId}
            onSelect={setTargetId}
          />
        ) : null}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={busy || !targetId}
            onClick={submit}
          >
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
