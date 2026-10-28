"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createStatusAction,
  deleteStatusAction,
  moveStatusAction,
  updateStatusAction,
} from "@/app/(dashboard)/_actions/feedback";
import { ColorPicker, SWATCHES } from "@/components/form/color-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_KINDS, type StatusKind } from "@/lib/schemas/feedback";
import type { StatusOption } from "./types";

/** Workspace feedback statuses, in order. Changes save right away. */
export function StatusesDialog({
  open,
  onOpenChange,
  workspace,
  statuses,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  statuses: StatusOption[];
  onChange: (statuses: StatusOption[]) => void;
}) {
  const [name, setName] = useState("");

  async function add() {
    const value = name.trim();
    if (!value) return;
    const color = SWATCHES[statuses.length % SWATCHES.length] ?? "#64748b";
    const status = { name: value, color, kind: "open" as const };
    const result = await createStatusAction({ workspace, ...status });
    if (!result.ok) return toast.error(result.error);
    onChange([...statuses, { id: result.data.id, ...status }]);
    setName("");
  }

  async function update(status: StatusOption, patch: Partial<StatusOption>) {
    const next = { ...status, ...patch };
    if (!next.name.trim()) return;
    onChange(statuses.map((s) => (s.id === status.id ? next : s)));
    const result = await updateStatusAction({
      workspace,
      id: next.id,
      name: next.name,
      color: next.color,
      kind: next.kind,
    });
    if (!result.ok) {
      toast.error(result.error);
      onChange(statuses);
    }
  }

  async function move(index: number, by: -1 | 1) {
    const target = index + by;
    const status = statuses[index];
    if (!status || target < 0 || target >= statuses.length) return;
    const next = [...statuses];
    next.splice(index, 1);
    next.splice(target, 0, status);
    onChange(next);
    const result = await moveStatusAction({
      workspace,
      id: status.id,
      prevId: next[target - 1]?.id ?? null,
      nextId: next[target + 1]?.id ?? null,
    });
    if (!result.ok) {
      toast.error(result.error);
      onChange(statuses);
    }
  }

  async function remove(status: StatusOption) {
    const result = await deleteStatusAction({ workspace, id: status.id });
    if (!result.ok) return toast.error(result.error);
    onChange(statuses.filter((s) => s.id !== status.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Statuses</DialogTitle>
          <DialogDescription>
            Shared by every board in this workspace. A “Done” status completes
            the item. Changes save right away.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {statuses.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <ColorPicker
                label={`Colour of ${s.name}`}
                value={s.color}
                onChange={(color) => update(s, { color })}
              />
              <Input
                aria-label="Status name"
                defaultValue={s.name}
                className="h-8"
                onBlur={(e) => {
                  if (e.target.value.trim() !== s.name) {
                    void update(s, { name: e.target.value.trim() });
                  }
                }}
              />
              <Select
                value={s.kind}
                onValueChange={(kind) =>
                  update(s, { kind: kind as StatusKind })
                }
              >
                <SelectTrigger
                  size="sm"
                  aria-label={`Kind of ${s.name}`}
                  className="w-40 shrink-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_KINDS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Move ${s.name} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Move ${s.name} down`}
                disabled={i === statuses.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Delete status ${s.name}`}
                onClick={() => remove(s)}
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
            aria-label="New status"
            placeholder="New status"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
