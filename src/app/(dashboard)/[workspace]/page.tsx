import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";
import { db } from "@/server/db/client";
import {
  RANGES,
  type Range,
  recentVotes,
  summary,
  topCards,
  viewsByDay,
} from "@/server/services/events";
import { requireWorkspace } from "@/server/session";

export const metadata: Metadata = { title: "Home" };

const RANGE_LABELS: Record<Range, string> = {
  "7d": "7D",
  "1m": "1M",
  "3m": "3M",
};

export default function WorkspaceHome({
  params,
  searchParams,
}: PageProps<"/[workspace]">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home
        slug={params.then((p) => p.workspace)}
        range={searchParams.then((q) =>
          typeof q.range === "string" && q.range in RANGES
            ? (q.range as Range)
            : "1m",
        )}
      />
    </Suspense>
  );
}

const compact = new Intl.NumberFormat("en", { notation: "compact" });
const dayLabel = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
async function Home({
  slug,
  range,
}: {
  slug: Promise<string>;
  range: Promise<Range>;
}) {
  const ctx = await requireWorkspace(await slug);
  const r = await range;
  const [days, totals, recent, top] = await Promise.all([
    viewsByDay(db, ctx, r),
    summary(db, ctx, r),
    recentVotes(db, ctx, 8),
    topCards(db, ctx, 5),
  ]);
  const base = `/${ctx.workspaceSlug}`;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Home</h1>
        <nav
          aria-label="Date range"
          className="inline-flex rounded-md border p-0.5 text-sm"
        >
          {(Object.keys(RANGES) as Range[]).map((key) => (
            <Link
              key={key}
              href={`${base}?range=${key}`}
              aria-current={key === r ? "page" : undefined}
              className={cn(
                "rounded px-3 py-1 text-muted-foreground transition-colors hover:text-foreground",
                key === r && "bg-muted font-medium text-foreground",
              )}
            >
              {RANGE_LABELS[key]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Page views" value={totals.views} />
        <Stat label="Unique visitors" value={totals.visitors} />
        <Stat label="Votes" value={totals.votes} />
      </div>

      <section className="rounded-lg border p-4">
        <ColumnChart
          title="Page views per day"
          unit="views"
          data={days.map((d) => ({
            key: d.day,
            label: dayLabel.format(new Date(`${d.day}T00:00:00Z`)),
            value: d.views,
          }))}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Recent votes</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No votes yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recent.map((v) => {
                const place = [v.city, v.country].filter(Boolean).join(", ");
                return (
                  <li key={v.id} className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1">
                      {v.voterName ?? "Someone"}
                      {place ? ` from ${place}` : ""} voted{" "}
                      <Link
                        href={`${base}/roadmap?card=${v.cardId}`}
                        className="font-medium hover:underline"
                      >
                        {v.cardTitle}
                      </Link>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ago(v.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Most voted</h2>
          {top.every((c) => c.votes === 0) ? (
            <p className="text-sm text-muted-foreground">No votes yet.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {top
                .filter((c) => c.votes > 0)
                .map((c) => (
                  <li key={c.id} className="flex items-baseline gap-2">
                    <Link
                      href={`${base}/roadmap?card=${c.id}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {c.title}
                    </Link>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {c.votes.toLocaleString("en")}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className="text-2xl font-semibold tabular-nums"
        title={value.toLocaleString("en")}
      >
        {value < 10_000 ? value.toLocaleString("en") : compact.format(value)}
      </span>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
