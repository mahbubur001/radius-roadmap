"use client";

import {
  BookOpen,
  CreditCard,
  FileText,
  Globe,
  Home,
  Inbox,
  KeyRound,
  type LucideIcon,
  Map as MapIcon,
  Megaphone,
  MessageSquare,
  Palette,
  PanelRight,
  Search,
  Settings,
  Users,
  Webhook,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { quickSearchAction } from "@/app/(dashboard)/_actions/search";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Stage } from "@/lib/stages";
import { cn } from "@/lib/utils";
import type { QuickSearchResult } from "@/server/services/search";
import { useSidebarCollapsed } from "./sidebar";
import { StageTick } from "./stage-tick";

const OPEN_EVENT = "rr:command-menu";

/** Opens the ⌘K menu from anywhere (e.g. the sidebar search button). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Entry = {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  href: string;
  /** Ideas and cards show their stage tick instead of the icon. */
  stage?: Stage | null;
};

const PAGES: [string, string, LucideIcon][] = [
  ["", "Home", Home],
  ["/feedback/inbox", "Feedback inbox", Inbox],
  ["/feedback", "All feedback", MessageSquare],
  ["/roadmap", "Roadmap", MapIcon],
  ["/updates", "Updates", Megaphone],
  ["/updates/subscribers", "Update subscribers", Users],
  ["/articles", "Articles", BookOpen],
  ["/public-settings", "Public settings", Globe],
  ["/widget", "Widget", PanelRight],
  ["/settings/workspace", "Workspace settings", Settings],
  ["/settings/branding", "Branding", Palette],
  ["/settings/domain", "Custom domain", Globe],
  ["/settings/team", "Team", Users],
  ["/settings/billing", "Billing", CreditCard],
  ["/settings/api", "API keys", KeyRound],
  ["/settings/webhooks", "Webhooks", Webhook],
];

/** ⌘K: jump to any page, or find an idea, card or article (doc 30). */
export function CommandMenu() {
  const { workspace } = useParams<{ workspace: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<QuickSearchResult | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const base = `/dashboard/${workspace}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Search after a short pause; stale answers are dropped.
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setFound(null);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await quickSearchAction({ workspace, q: term });
      if (!stale && result.ok) setFound(result.data);
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q, workspace]);

  const entries = useMemo<Entry[]>(() => {
    const term = q.trim().toLowerCase();
    const pages = PAGES.filter(([, label]) =>
      label.toLowerCase().includes(term),
    ).map(([href, label, icon]) => ({
      key: `page:${href}`,
      group: "Jump to",
      label,
      icon,
      href: `${base}${href}`,
    }));
    if (!found) return pages;
    return [
      ...pages,
      ...found.ideas.map((i) => ({
        key: `idea:${i.id}`,
        group: "Ideas",
        label: i.title,
        hint: `${i.votes}`,
        icon: MessageSquare,
        href: `${base}/feedback?feedback=${i.id}`,
        stage: i.stage,
      })),
      ...found.cards.map((c) => ({
        key: `card:${c.id}`,
        group: "Roadmap cards",
        label: c.title,
        hint: c.roadmapName,
        icon: MapIcon,
        href: `${base}/roadmap?r=${encodeURIComponent(c.roadmapSlug)}&card=${c.id}`,
        stage: c.stage,
      })),
      ...found.articles.map((a) => ({
        key: `article:${a.id}`,
        group: "Articles",
        label: a.title,
        hint: a.status === "draft" ? "Draft" : undefined,
        icon: FileText,
        href: `${base}/articles/${a.id}`,
      })),
    ];
  }, [q, found, base]);

  const current = Math.min(active, Math.max(entries.length - 1, 0));

  function close() {
    setOpen(false);
    setQ("");
    setFound(null);
    setActive(0);
  }

  function go(entry: Entry | undefined) {
    if (!entry) return;
    close();
    router.push(entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = entries.length;
      if (!n) return;
      const next = (current + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      setActive(next);
      list.current
        ?.querySelector(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(entries[current]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent
        showCloseButton={false}
        className="top-[14vh] translate-y-0 gap-0 overflow-hidden p-0 shadow-pop sm:max-w-[620px]"
      >
        <DialogTitle className="sr-only">Search or jump to</DialogTitle>
        <DialogDescription className="sr-only">
          Type a page name, or words from an idea, card or article.
        </DialogDescription>
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search ideas, cards, articles, or jump to a page…"
            aria-label="Search or jump to"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={
              entries[current] ? `${listId}-${current}` : undefined
            }
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
            esc
          </kbd>
        </div>
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Results"
          className="max-h-[380px] overflow-y-auto p-1.5"
        >
          {entries.length ? (
            entries.map((entry, i) => (
              <div key={entry.key}>
                {entry.group !== entries[i - 1]?.group ? (
                  <p className="px-2.5 pt-2.5 pb-1 font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase">
                    {entry.group}
                  </p>
                ) : null}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === current}
                  tabIndex={-1}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(entry)}
                  onKeyDown={() => undefined}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-muted-foreground",
                    i === current && "bg-accent",
                  )}
                >
                  {entry.stage !== undefined ? (
                    <StageTick stage={entry.stage} />
                  ) : (
                    <entry.icon className="size-4 shrink-0" />
                  )}
                  <span className="flex-1 truncate text-foreground">
                    {entry.label}
                  </span>
                  {entry.hint ? (
                    <span className="truncate font-mono text-[11px] text-faint">
                      {entry.hint}
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing matches “{q.trim()}”.
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-[11.5px] text-faint">
          <span>↑ ↓ move</span>
          <span>↵ open</span>
          <span className="ml-auto">⌘K opens this anywhere</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The sidebar's "Search or jump to…" button. */
export function CommandButton() {
  const collapsed = useSidebarCollapsed();
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      aria-label="Search or jump to (⌘K)"
      className={cn(
        "mb-2 flex items-center gap-2 rounded-lg text-faint shadow-[inset_0_0_0_1px_var(--sidebar-border)] transition-colors hover:bg-background hover:text-muted-foreground",
        collapsed ? "size-9 justify-center" : "w-full px-2 py-1.5 text-left",
      )}
    >
      <Search className="size-3.5 shrink-0" />
      {collapsed ? null : (
        <>
          <span className="flex-1 text-[13px]">Search or jump to…</span>
          <kbd className="rounded border border-sidebar-border px-1 font-mono text-[10.5px]">
            ⌘K
          </kbd>
        </>
      )}
    </button>
  );
}
