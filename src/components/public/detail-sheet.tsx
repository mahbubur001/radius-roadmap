"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PHONE, useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";

/**
 * A card or idea opened over the list: a bottom sheet with a grab handle on
 * phones (doc 31 M3), the right-hand drawer from tablet width up.
 */
export function DetailSheet({
  open,
  onClose,
  title,
  description,
  wide = "xl",
  fit = false,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** Drawer width on larger screens. */
  wide?: "md" | "xl";
  /** Phones: as tall as the content (forms) instead of 92% of the screen. */
  fit?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const phone = useMedia(PHONE);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "gap-0 overflow-y-auto p-0",
          phone
            ? cn(
                "rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
                fit
                  ? "data-[side=bottom]:max-h-[92svh]"
                  : "data-[side=bottom]:h-[92svh]",
              )
            : wide === "md"
              ? "data-[side=right]:w-full data-[side=right]:sm:max-w-md"
              : "data-[side=right]:w-full data-[side=right]:sm:max-w-xl",
          className,
        )}
      >
        {phone ? (
          <span
            aria-hidden="true"
            className="sticky top-0 z-10 mx-auto mt-2 mb-1 block h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          />
        ) : null}
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
