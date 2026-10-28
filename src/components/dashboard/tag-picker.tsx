"use client";

import { Plus, Tags, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createTagAction } from "@/app/(dashboard)/_actions/roadmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type TagOption = { id: string; name: string };

/** Workspace tags with inline create, shared by the card and feedback drawers. */
export function TagPicker({
  workspace,
  tags,
  selected,
  onChange,
  onCreated,
}: {
  workspace: string;
  tags: TagOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onCreated: (tag: TagOption) => void;
}) {
  const [name, setName] = useState("");
  const chosen = tags.filter((t) => selected.includes(t.id));

  async function create() {
    const value = name.trim();
    if (!value) return;
    const result = await createTagAction({ workspace, name: value });
    if (!result.ok) return toast.error(result.error);
    onCreated(result.data);
    if (!selected.includes(result.data.id)) {
      onChange([...selected, result.data.id]);
    }
    setName("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Tags</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {chosen.map((t) => (
          <Badge key={t.id} variant="secondary" className="gap-1">
            {t.name}
            <button
              type="button"
              aria-label={`Remove tag ${t.name}`}
              onClick={() => onChange(selected.filter((id) => id !== t.id))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Tags />
              Edit tags
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex w-64 flex-col gap-2">
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {tags.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags yet.</p>
              ) : null}
              {tags.map((t) => (
                <Label
                  key={t.id}
                  className="flex items-center gap-2 font-normal"
                >
                  <Checkbox
                    checked={selected.includes(t.id)}
                    onCheckedChange={(on) =>
                      onChange(
                        on
                          ? [...selected, t.id]
                          : selected.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.name}
                </Label>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <Input
                aria-label="New tag"
                placeholder="New tag"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" size="icon" aria-label="Add tag">
                <Plus />
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
