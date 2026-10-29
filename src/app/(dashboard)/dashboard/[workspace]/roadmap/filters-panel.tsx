"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { BoardCard, CategoryOption, TagOption } from "./types";

// The roadmap board's filters (doc 21 §2 step A). Filtering runs on the
// client over the loaded cards; the state is mirrored in the URL.

type Presence = "all" | "some" | "none";

export type RoadmapFilters = {
  /** Category id, "none" (no objective) or "all". */
  objective: string;
  /** Cards with any of these tags. */
  tags: string[];
  visibility: "all" | "public" | "private";
  votes: Presence;
  description: Presence;
  feedback: Presence;
  showCompleted: boolean;
};

export const defaultFilters: RoadmapFilters = {
  objective: "all",
  tags: [],
  visibility: "all",
  votes: "all",
  description: "all",
  feedback: "all",
  showCompleted: true,
};

const PRESENCE = ["all", "some", "none"] as const;
const VISIBILITY = ["all", "public", "private"] as const;

function oneOf<T extends string>(list: readonly T[], value: string | null) {
  return list.find((v) => v === value);
}

export function filtersFromParams(params: URLSearchParams): RoadmapFilters {
  return {
    objective: params.get("obj") ?? "all",
    tags: params.get("tags")?.split(",").filter(Boolean) ?? [],
    visibility: oneOf(VISIBILITY, params.get("vis")) ?? "all",
    votes: oneOf(PRESENCE, params.get("votes")) ?? "all",
    description: oneOf(PRESENCE, params.get("desc")) ?? "all",
    feedback: oneOf(PRESENCE, params.get("fb")) ?? "all",
    showCompleted: params.get("done") !== "hide",
  };
}

/** Writes non-default filters into `params` (and removes default ones). */
export function filtersToParams(f: RoadmapFilters, params: URLSearchParams) {
  const set = (key: string, value: string | null) =>
    value ? params.set(key, value) : params.delete(key);
  set("obj", f.objective === "all" ? null : f.objective);
  set("tags", f.tags.length ? f.tags.join(",") : null);
  set("vis", f.visibility === "all" ? null : f.visibility);
  set("votes", f.votes === "all" ? null : f.votes);
  set("desc", f.description === "all" ? null : f.description);
  set("fb", f.feedback === "all" ? null : f.feedback);
  set("done", f.showCompleted ? null : "hide");
}

/** Filters that narrow the board (the completed toggle has its own button). */
export function activeFilterCount(f: RoadmapFilters) {
  return [
    f.objective !== "all",
    f.tags.length > 0,
    f.visibility !== "all",
    f.votes !== "all",
    f.description !== "all",
    f.feedback !== "all",
  ].filter(Boolean).length;
}

function present(p: Presence, has: boolean) {
  return p === "all" || (p === "some") === has;
}

export function matchesFilters(card: BoardCard, f: RoadmapFilters) {
  return (
    (f.objective === "all" ||
      (f.objective === "none"
        ? !card.categoryId
        : card.categoryId === f.objective)) &&
    (!f.tags.length || f.tags.some((t) => card.tagIds.includes(t))) &&
    (f.visibility === "all" || card.isPublic === (f.visibility === "public")) &&
    present(f.votes, card.votes > 0) &&
    present(f.description, card.summaryText.trim().length > 0) &&
    present(f.feedback, card.ideas > 0) &&
    (f.showCompleted || !card.completed)
  );
}

export function FiltersPanel({
  filters,
  onChange,
  objectives,
  tags,
}: {
  filters: RoadmapFilters;
  onChange: (next: RoadmapFilters) => void;
  objectives: CategoryOption[];
  tags: TagOption[];
}) {
  const set = (change: Partial<RoadmapFilters>) =>
    onChange({ ...filters, ...change });

  return (
    <aside
      aria-label="Filters"
      className="flex w-60 shrink-0 flex-col gap-1 self-start rounded-lg border bg-card p-3 text-sm"
    >
      <h2 className="px-1 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Filters
      </h2>

      <Section title="Objective" open active={filters.objective !== "all"}>
        <Radios
          name="objective"
          value={filters.objective}
          onChange={(objective) => set({ objective })}
          options={[
            ["all", "No preference"],
            ...objectives.map((o) => [o.id, o.name, o.color] as const),
            ["none", "No objective"],
          ]}
        />
      </Section>

      {tags.length ? (
        <Section title="Tags" active={filters.tags.length > 0}>
          {tags.map((t) => (
            <label
              key={t.id}
              htmlFor={`filter-tag-${t.id}`}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-muted"
            >
              <Checkbox
                id={`filter-tag-${t.id}`}
                checked={filters.tags.includes(t.id)}
                onCheckedChange={(on) =>
                  set({
                    tags: on
                      ? [...filters.tags, t.id]
                      : filters.tags.filter((id) => id !== t.id),
                  })
                }
              />
              <span className="truncate">{t.name}</span>
            </label>
          ))}
        </Section>
      ) : null}

      <Section title="Public status" active={filters.visibility !== "all"}>
        <Radios
          name="visibility"
          value={filters.visibility}
          onChange={(v) =>
            set({ visibility: v as RoadmapFilters["visibility"] })
          }
          options={[
            ["all", "No preference"],
            ["public", "Public"],
            ["private", "Private"],
          ]}
        />
      </Section>

      <PresenceSection
        title="Votes"
        some="Has votes"
        none="No votes"
        value={filters.votes}
        onChange={(votes) => set({ votes })}
      />
      <PresenceSection
        title="Description"
        some="Has a description"
        none="No description"
        value={filters.description}
        onChange={(description) => set({ description })}
      />
      <PresenceSection
        title="Feedbacks"
        some="Linked feedback"
        none="No linked feedback"
        value={filters.feedback}
        onChange={(feedback) => set({ feedback })}
      />

      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        disabled={!activeFilterCount(filters)}
        onClick={() =>
          onChange({ ...defaultFilters, showCompleted: filters.showCompleted })
        }
      >
        Reset
      </Button>
    </aside>
  );
}

function Section({
  title,
  open,
  active,
  children,
}: {
  title: string;
  open?: boolean;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open || active} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm px-1 py-1.5 font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        {title}
        {active ? (
          <span className="ml-auto size-1.5 rounded-full bg-primary" />
        ) : null}
      </summary>
      <div className="flex flex-col pb-1 pl-5">{children}</div>
    </details>
  );
}

function PresenceSection({
  title,
  some,
  none,
  value,
  onChange,
}: {
  title: string;
  some: string;
  none: string;
  value: Presence;
  onChange: (value: Presence) => void;
}) {
  return (
    <Section title={title} active={value !== "all"}>
      <Radios
        name={title}
        value={value}
        onChange={(v) => onChange(v as Presence)}
        options={[
          ["all", "No preference"],
          ["some", some],
          ["none", none],
        ]}
      />
    </Section>
  );
}

function Radios({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string, string?])[];
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col">
      {options.map(([key, label, color]) => (
        <label
          key={key}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-muted",
            value === key ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name={`filter-${name}`}
            checked={value === key}
            onChange={() => onChange(key)}
            className="size-3.5 cursor-pointer accent-primary"
          />
          {color ? (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
          ) : null}
          <span className="truncate">{label}</span>
        </label>
      ))}
    </div>
  );
}
