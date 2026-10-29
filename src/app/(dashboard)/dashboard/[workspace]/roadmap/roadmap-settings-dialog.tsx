"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  createColumnAction,
  deleteColumnAction,
  deleteRoadmapAction,
  updateColumnAction,
  updateRoadmapAction,
} from "@/app/(dashboard)/_actions/roadmap";
import { ConfirmDelete } from "@/components/form/confirm-delete";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { RoadmapDisplaySettings } from "@/lib/schemas/roadmap";
import { type BoardColumn, type BoardRoadmap, byPosition } from "./types";

const displayLabels: Record<keyof RoadmapDisplaySettings, string> = {
  showVotes: "Vote counts",
  showObjectives: "Objectives",
  showTags: "Tags",
  showDates: "Planned-for dates",
  showDescriptions: "Descriptions",
  showCompleted: "Completed cards",
  showFeatures: "Features progress",
};

export function RoadmapSettingsDialog({
  open,
  onOpenChange,
  workspace,
  roadmap,
  columns,
  publicUrl,
  onColumnsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  roadmap: BoardRoadmap;
  columns: BoardColumn[];
  publicUrl: string;
  onColumnsChange: (columns: BoardColumn[]) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    internalTitle: roadmap.internalTitle,
    publicTitle: roadmap.publicTitle ?? "",
    internalSummary: roadmap.internalSummary ?? "",
    publicSummary: roadmap.publicSummary ?? "",
    isPublic: roadmap.isPublic,
    display: roadmap.display,
  });
  const [busy, setBusy] = useState(false);
  const [newColumn, setNewColumn] = useState("");
  const sorted = [...columns].sort(byPosition);

  async function save() {
    setBusy(true);
    const result = await updateRoadmapAction({
      workspace,
      id: roadmap.id,
      ...form,
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Roadmap saved.");
    onOpenChange(false);
    router.refresh();
  }

  async function updateColumn(
    column: BoardColumn,
    patch: Partial<BoardColumn>,
  ) {
    const next = { ...column, ...patch };
    if (!next.name.trim()) return;
    onColumnsChange(columns.map((c) => (c.id === column.id ? next : c)));
    const result = await updateColumnAction({
      workspace,
      id: column.id,
      name: next.name,
      isPublic: next.isPublic,
      isDone: next.isDone,
    });
    if (!result.ok) {
      toast.error(result.error);
      onColumnsChange(columns);
    }
  }

  async function addColumn() {
    const name = newColumn.trim();
    if (!name) return;
    const result = await createColumnAction({
      workspace,
      roadmapId: roadmap.id,
      name,
    });
    if (!result.ok) return toast.error(result.error);
    setNewColumn("");
    router.refresh();
  }

  async function removeColumn(column: BoardColumn) {
    const result = await deleteColumnAction({ workspace, id: column.id });
    if (!result.ok) return toast.error(result.error);
    onColumnsChange(columns.filter((c) => c.id !== column.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit roadmap</DialogTitle>
          <DialogDescription>
            Internal fields are for your team; public fields show on{" "}
            <a
              className="underline"
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
            >
              the public roadmap
            </a>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rm-internal-title">Internal title</Label>
            <Input
              id="rm-internal-title"
              value={form.internalTitle}
              onChange={(e) =>
                setForm({ ...form, internalTitle: e.target.value })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rm-public-title">Public title</Label>
            <Input
              id="rm-public-title"
              placeholder="Same as the internal title"
              value={form.publicTitle}
              onChange={(e) =>
                setForm({ ...form, publicTitle: e.target.value })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rm-internal-summary">Internal summary</Label>
            <Textarea
              id="rm-internal-summary"
              value={form.internalSummary}
              onChange={(e) =>
                setForm({ ...form, internalSummary: e.target.value })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rm-public-summary">Public summary</Label>
            <Textarea
              id="rm-public-summary"
              value={form.publicSummary}
              onChange={(e) =>
                setForm({ ...form, publicSummary: e.target.value })
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="rm-public">Public roadmap</Label>
            <p className="text-xs text-muted-foreground">
              Off hides this roadmap from the public site and the embed.
            </p>
          </div>
          <Switch
            id="rm-public"
            checked={form.isPublic}
            onCheckedChange={(isPublic) => setForm({ ...form, isPublic })}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">
            Show on the public roadmap
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              Object.keys(displayLabels) as (keyof RoadmapDisplaySettings)[]
            ).map((key) => (
              <Label
                key={key}
                className="flex items-center justify-between rounded-md border px-3 py-2 font-normal"
              >
                {displayLabels[key]}
                <Switch
                  checked={form.display[key]}
                  onCheckedChange={(on) =>
                    setForm({
                      ...form,
                      display: { ...form.display, [key]: on },
                    })
                  }
                />
              </Label>
            ))}
          </div>
        </fieldset>

        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save roadmap"}
          </Button>
        </DialogFooter>

        <Separator />

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Columns</h3>
          <p className="text-xs text-muted-foreground">
            Changes save right away. Drag columns on the board to reorder them.
            Cards in a "done" column count as completed.
          </p>
          <ul className="flex flex-col gap-2">
            {sorted.map((column) => (
              <li
                key={column.id}
                className="flex flex-wrap items-center gap-3 rounded-md border p-2"
              >
                <Input
                  aria-label="Column name"
                  defaultValue={column.name}
                  className="h-8 max-w-48"
                  onBlur={(e) => {
                    if (e.target.value.trim() !== column.name) {
                      void updateColumn(column, {
                        name: e.target.value.trim(),
                      });
                    }
                  }}
                />
                <Label className="flex items-center gap-2 font-normal">
                  <Switch
                    checked={column.isPublic}
                    onCheckedChange={(isPublic) =>
                      updateColumn(column, { isPublic })
                    }
                  />
                  Public
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <Switch
                    checked={column.isDone}
                    onCheckedChange={(isDone) =>
                      updateColumn(column, { isDone })
                    }
                  />
                  Done
                </Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-8"
                  aria-label={`Delete column ${column.name}`}
                  onClick={() => removeColumn(column)}
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
              void addColumn();
            }}
          >
            <Input
              aria-label="New column"
              placeholder="New column"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
            />
            <Button type="submit" variant="outline">
              Add column
            </Button>
          </form>
        </section>

        <Separator />

        <section className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium">Delete roadmap</h3>
            <p className="text-xs text-muted-foreground">
              Deletes its columns, cards and votes for good.
            </p>
          </div>
          <ConfirmDelete
            trigger="Delete"
            title="Delete this roadmap?"
            description="Its columns, cards, features and votes are deleted for good."
            confirmText={roadmap.internalTitle}
            actionLabel="Delete roadmap"
            onConfirm={async () => {
              const result = await deleteRoadmapAction({
                workspace,
                id: roadmap.id,
              });
              if (!result.ok) {
                toast.error(result.error);
                return false;
              }
              toast.success("Roadmap deleted.");
              onOpenChange(false);
              router.push(`/dashboard/${workspace}/roadmap`);
              router.refresh();
              return true;
            }}
          />
        </section>
      </DialogContent>
    </Dialog>
  );
}
