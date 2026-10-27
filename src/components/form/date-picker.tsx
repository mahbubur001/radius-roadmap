"use client";

import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// The app's date pickers. Use these instead of <input type="date"> anywhere
// in the app. Values are ISO dates ("2026-10-27"), the format of Postgres
// `date` columns, so they pass straight through Zod (`z.iso.date()`).

const DISPLAY = "MMM d, yyyy";

function toDate(value: string | null | undefined) {
  if (!value) return undefined;
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
}

function toIso(date: Date | undefined) {
  return date ? format(date, "yyyy-MM-dd") : null;
}

function ClearButton({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
      aria-label={label}
      onClick={onClear}
    >
      <X />
    </Button>
  );
}

/** Single date. `null` = no date. */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = true,
  disabled,
  className,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start font-normal",
              !selected && "text-muted-foreground",
              clearable && selected && "pr-9",
            )}
          >
            <CalendarIcon />
            {selected ? format(selected, DISPLAY) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            onSelect={(date) => {
              onChange(toIso(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && selected && !disabled ? (
        <ClearButton label="Clear date" onClear={() => onChange(null)} />
      ) : null}
    </div>
  );
}

export type DateRangeValue = { from: string | null; to: string | null };

export type DateRangePreset = { label: string; days: number };

/** Common presets for analytics-style ranges (ending today). */
export const RECENT_PRESETS: DateRangePreset[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

/** A from–to range, with optional quick presets. */
export function DateRangePicker({
  id,
  value,
  onChange,
  presets,
  placeholder = "Pick a date range",
  clearable = true,
  disabled,
  className,
}: {
  id?: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  presets?: DateRangePreset[];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const from = toDate(value.from);
  const to = toDate(value.to);
  const range: DateRange | undefined = from ? { from, to } : undefined;

  const label = from
    ? to
      ? `${format(from, DISPLAY)} – ${format(to, DISPLAY)}`
      : format(from, DISPLAY)
    : placeholder;

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start font-normal",
              !from && "text-muted-foreground",
              clearable && from && "pr-9",
            )}
          >
            <CalendarIcon />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto p-0" align="start">
          {presets?.length ? (
            <div className="flex flex-col gap-1 border-r p-2">
              {presets.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - (p.days - 1));
                    onChange({ from: toIso(start), to: toIso(end) });
                    setOpen(false);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          ) : null}
          <Calendar
            mode="range"
            selected={range}
            defaultMonth={from}
            numberOfMonths={2}
            onSelect={(next) => {
              onChange({ from: toIso(next?.from), to: toIso(next?.to) });
              if (next?.from && next.to && next.from !== next.to)
                setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && from && !disabled ? (
        <ClearButton
          label="Clear dates"
          onClear={() => onChange({ from: null, to: null })}
        />
      ) : null}
    </div>
  );
}
