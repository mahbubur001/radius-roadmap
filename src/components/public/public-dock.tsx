import { CircleHelp, List, Newspaper, Plus, Route } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ICONS = {
  roadmap: Route,
  ideas: List,
  updates: Newspaper,
  articles: CircleHelp,
} as const;

/**
 * Phones (doc 32): a dark dock at the bottom with the site's modules and a
 * raised brand "+" in the middle to share an idea (only when Ideas is on).
 */
export function PublicDock({
  items,
  shareHref,
}: {
  items: {
    key: keyof typeof ICONS;
    label: string;
    href: string;
    active: boolean;
  }[];
  shareHref: string | null;
}) {
  // The "+" sits in the middle; with an odd count the extra section goes left.
  const mid = Math.ceil(items.length / 2);
  const link = (i: (typeof items)[number]) => {
    const Icon = ICONS[i.key];
    return (
      <Link
        key={i.key}
        href={i.href}
        aria-current={i.active ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-col items-center gap-[3px] font-t-mono text-[10px] font-semibold tracking-[0.06em] uppercase",
          i.active ? "opacity-100" : "opacity-55",
        )}
      >
        <Icon className="size-5" strokeWidth={1.8} />
        <span className="max-w-full truncate">{i.label}</span>
      </Link>
    );
  };
  return (
    <nav
      aria-label="Site sections"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid h-[66px] items-center justify-items-center rounded-[22px] bg-foreground px-1.5 text-background shadow-[0_18px_40px_-18px_rgb(0_0_0/0.6)] md:hidden"
      // Every slot (each section and the "+") gets the same width, so the
      // spacing stays even with 2, 3 or 4 sections.
      style={{
        gridTemplateColumns: `repeat(${items.length + (shareHref ? 1 : 0)}, minmax(0, 1fr))`,
      }}
    >
      {items.slice(0, mid).map(link)}
      {shareHref ? (
        <Link
          href={shareHref}
          aria-label="Share an idea"
          className="-mt-[26px] grid size-[54px] place-items-center rounded-[18px] bg-primary text-primary-foreground shadow-[0_10px_20px_-8px_color-mix(in_oklab,var(--primary)_80%,transparent)]"
        >
          <Plus className="size-6" strokeWidth={2} />
        </Link>
      ) : null}
      {items.slice(mid).map(link)}
    </nav>
  );
}
