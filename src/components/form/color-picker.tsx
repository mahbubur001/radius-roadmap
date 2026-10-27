"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Swatches offered by default (readable on light and dark backgrounds). */
export const SWATCHES = [
  "#7c3aed",
  "#2563eb",
  "#0891b2",
  "#16a34a",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#9333ea",
  "#475569",
  "#0f766e",
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Colour swatch button that opens a palette plus a hex field. */
export function ColorPicker({
  value,
  onChange,
  label,
  swatches = SWATCHES,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  swatches?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setHex(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          aria-label={label}
        >
          <span
            className="size-4 rounded-full"
            style={{ backgroundColor: value }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-56 flex-col gap-3" align="start">
        <div className="grid grid-cols-6 gap-2">
          {swatches.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={color.toLowerCase() === value.toLowerCase()}
              className={cn(
                "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-popover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
              style={{ backgroundColor: color }}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
            >
              {color.toLowerCase() === value.toLowerCase() ? (
                <Check className="size-4 text-white" />
              ) : null}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (HEX.test(hex)) {
              onChange(hex.toLowerCase());
              setOpen(false);
            }
          }}
        >
          <span
            className="size-6 shrink-0 rounded-full border"
            style={{ backgroundColor: HEX.test(hex) ? hex : value }}
          />
          <Input
            aria-label="Hex colour"
            className="h-8 font-mono"
            value={hex}
            maxLength={7}
            onChange={(e) => setHex(e.target.value)}
          />
        </form>
      </PopoverContent>
    </Popover>
  );
}
