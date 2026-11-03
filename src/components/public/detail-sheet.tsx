"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PHONE, useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";

/**
 * A card or idea opened over the list: a bottom sheet with a grab handle on
 * phones (doc 31 M3), the right-hand drawer from tablet width up. `ticket`
 * (doc 32) is the floating Transit ticket: rounded, inset, its own close
 * button; the child fills it and scrolls its own body.
 */
export function DetailSheet({
  open,
  onClose,
  title,
  description,
  wide = "xl",
  fit = false,
  ticket = false,
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
  ticket?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const phone = useMedia(PHONE);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        showCloseButton={!ticket}
        overlayClassName={
          ticket
            ? "bg-[rgba(8,10,14,.45)] supports-backdrop-filter:backdrop-blur-none"
            : undefined
        }
        className={cn(
          "gap-0 p-0",
          ticket
            ? cn(
                "flex flex-col overflow-hidden border-0 bg-sheet text-[15px] text-foreground shadow-none",
                phone
                  ? "rounded-t-[26px] data-[side=bottom]:h-[92svh]"
                  : "rounded-[22px] data-[side=right]:inset-y-4 data-[side=right]:right-4 data-[side=right]:h-auto data-[side=right]:w-[min(520px,calc(100%-32px))] data-[side=right]:sm:max-w-none",
              )
            : cn(
                "overflow-y-auto",
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
              ),
          className,
        )}
      >
        {phone ? (
          <span
            aria-hidden="true"
            className={
              ticket
                ? "absolute top-2 left-1/2 z-20 h-[5px] w-10 -translate-x-1/2 rounded-[3px] bg-rule2"
                : "sticky top-0 z-10 mx-auto mt-2 mb-1 block h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
            }
          />
        ) : null}
        {ticket ? (
          <SheetClose
            aria-label="Close"
            className="absolute top-[18px] right-[18px] z-20 grid size-[34px] place-items-center rounded-full bg-paper focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X strokeWidth={1.8} className="size-4" />
          </SheetClose>
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
