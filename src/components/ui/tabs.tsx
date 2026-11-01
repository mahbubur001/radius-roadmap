"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list items-center text-muted-foreground group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "inline-flex w-fit justify-center rounded-lg bg-muted p-[3px] group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit",
        // Underline tabs (LoopedIn): a divider line with the active tab's
        // underline sitting on it.
        line: "flex gap-6 border-b",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const TabsVariant = React.createContext<"default" | "line">("default");

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsVariant.Provider value={variant ?? "default"}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsVariant.Provider>
  );
}

const triggerBase =
  "relative inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

// Separate class sets per variant: cn() doesn't merge conflicting Tailwind
// classes, so a variant can't safely override the other's.
const triggerVariants = {
  default:
    "h-[calc(100%-1px)] flex-1 rounded-md border border-transparent px-1.5 py-0.5 text-foreground/60 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:text-muted-foreground dark:hover:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
  line: "-mb-px flex-none rounded-none border-b-2 border-transparent px-1 pt-1 pb-3 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=active]:border-(--tab-accent,var(--primary)) data-[state=active]:text-(--tab-accent,var(--primary))",
};

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariant);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(triggerBase, triggerVariants[variant], className)}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
