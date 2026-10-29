"use client";

import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CategoryOption } from "./types";

/**
 * Objective (category) picker with search and inline "Add new". Used on board
 * cards and in the card drawer. `onCreate` is only passed to admins.
 */
export function ObjectivePicker({
  objectives,
  value,
  onChange,
  onCreate,
  variant = "inline",
  id,
  className,
}: {
  objectives: CategoryOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate?: (name: string) => Promise<CategoryOption | null>;
  /** `inline`: small text trigger on a card; `field`: full-width form field. */
  variant?: "inline" | "field";
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const current = objectives.find((o) => o.id === value);
  const needle = q.trim().toLowerCase();
  const shown = objectives.filter((o) => o.name.toLowerCase().includes(needle));
  const exact = objectives.some((o) => o.name.toLowerCase() === needle);

  function pick(next: string | null) {
    setOpen(false);
    setQ("");
    if (next !== value) onChange(next);
  }

  async function create() {
    if (!onCreate || !q.trim() || busy) return;
    setBusy(true);
    const created = await onCreate(q.trim());
    setBusy(false);
    if (created) pick(created.id);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={`Objective: ${current?.name ?? "none"}`}
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-left",
            variant === "inline"
              ? "rounded-sm text-xs font-medium hover:text-foreground"
              : "h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs",
            className,
          )}
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              !current && "border border-muted-foreground",
            )}
            style={current ? { backgroundColor: current.color } : undefined}
          />
          <span className={cn("truncate", !current && "text-muted-foreground")}>
            {current?.name ?? "No objective"}
          </span>
          <ChevronDown
            className={cn(
              "shrink-0 text-muted-foreground",
              variant === "inline" ? "size-3" : "ml-auto size-4",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="relative border-b">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="Search objectives"
            placeholder="Search…"
            className="border-0 pl-8 shadow-none focus-visible:ring-0"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (shown.length === 1 && shown[0]) pick(shown[0].id);
              else if (!exact) void create();
            }}
          />
        </div>
        {onCreate && needle && !exact ? (
          <Button
            size="sm"
            className="m-2 mb-0 w-[calc(100%-1rem)] justify-start"
            disabled={busy}
            onClick={() => void create()}
          >
            <Plus />
            Add “{q.trim()}”
          </Button>
        ) : null}
        <div
          role="listbox"
          aria-label="Objectives"
          className="flex max-h-64 flex-col overflow-y-auto p-1"
        >
          {shown.map((o) => (
            <Option
              key={o.id}
              color={o.color}
              label={o.name}
              selected={o.id === value}
              onSelect={() => pick(o.id)}
            />
          ))}
          {!needle ? (
            <Option
              label="No objective"
              selected={!value}
              onSelect={() => pick(null)}
            />
          ) : null}
          {needle && !shown.length && !onCreate ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No objectives match.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Option({
  color,
  label,
  selected,
  onSelect,
}: {
  color?: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
    >
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          !color && "border border-muted-foreground",
        )}
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="flex-1 truncate">{label}</span>
      {selected ? <Check className="size-4" /> : null}
    </button>
  );
}
