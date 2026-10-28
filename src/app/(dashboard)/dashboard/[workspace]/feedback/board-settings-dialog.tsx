"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteBoardAction,
  updateBoardAction,
} from "@/app/(dashboard)/_actions/feedback";
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
import type { BoardOption } from "./types";

export function BoardSettingsDialog({
  open,
  onOpenChange,
  workspace,
  board,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  board: BoardOption;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: board.name,
    slug: board.slug,
    description: board.description ?? "",
    isPublic: board.isPublic,
    autoPublish: board.autoPublish,
  });
  const [busy, setBusy] = useState(false);
  const base = `/dashboard/${workspace}/feedback`;

  async function save() {
    setBusy(true);
    const result = await updateBoardAction({
      workspace,
      id: board.id,
      ...form,
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Board saved.");
    onOpenChange(false);
    router.replace(`${base}?b=${result.data.slug}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit board</DialogTitle>
            <DialogDescription>
              Name, address and who sees new submissions.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="board-name">Name</Label>
            <Input
              id="board-name"
              value={form.name}
              maxLength={60}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="board-slug">URL</Label>
            <Input
              id="board-slug"
              value={form.slug}
              maxLength={48}
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value.toLowerCase() })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="board-description">Description</Label>
            <Textarea
              id="board-description"
              value={form.description}
              maxLength={500}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="board-public">Public board</Label>
              <p className="text-xs text-muted-foreground">
                Shown on your public site. Private boards are for the team.
              </p>
            </div>
            <Switch
              id="board-public"
              checked={form.isPublic}
              onCheckedChange={(isPublic) => setForm({ ...form, isPublic })}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="board-auto-publish">
                Publish new submissions right away
              </Label>
              <p className="text-xs text-muted-foreground">
                Off: new ideas wait in the Inbox until someone approves them.
              </p>
            </div>
            <Switch
              id="board-auto-publish"
              checked={form.autoPublish}
              onCheckedChange={(autoPublish) =>
                setForm({ ...form, autoPublish })
              }
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              Save board
            </Button>
          </DialogFooter>
        </form>

        {canDelete ? (
          <>
            <Separator />
            <section className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium">Delete board</h3>
                <p className="text-xs text-muted-foreground">
                  Only an empty board can be deleted. Move its feedback first.
                </p>
              </div>
              <ConfirmDelete
                trigger="Delete"
                title="Delete this board?"
                description="The board is deleted for good. It must have no feedback left."
                confirmText={board.name}
                actionLabel="Delete board"
                onConfirm={async () => {
                  const result = await deleteBoardAction({
                    workspace,
                    id: board.id,
                  });
                  if (!result.ok) {
                    toast.error(result.error);
                    return false;
                  }
                  toast.success("Board deleted.");
                  onOpenChange(false);
                  router.push(base);
                  router.refresh();
                  return true;
                }}
              />
            </section>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
