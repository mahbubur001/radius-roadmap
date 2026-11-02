import {
  ArrowRight,
  CalendarClock,
  Inbox,
  type LucideIcon,
  MessageSquare,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { StageTick } from "@/components/dashboard/stage-tick";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_COLORS, STAGE_LABELS, STAGES, type Stage } from "@/lib/stages";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";
import { db } from "@/server/db/client";
import { articleStats } from "@/server/services/articles";
import {
  RANGES,
  type Range,
  summary,
  viewsByDay,
} from "@/server/services/events";
import {
  type Loud,
  loudest,
  needsYou,
  outcomes,
  recentActivity,
  type SignalCounts,
  shippedNotAnnounced,
  signalCounts,
} from "@/server/services/signal";
import { requireWorkspace } from "@/server/session";

export const metadata: Metadata = { title: "Home" };

const RANGE_LABELS: Record<Range, string> = {
  "7d": "7d",
  "1m": "30d",
  "3m": "90d",
};

export default function WorkspaceHome({
  params,
  searchParams,
}: PageProps<"/dashboard/[workspace]">) {
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
const today = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dayLabel = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const when = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function num(n: number) {
  return n < 10_000 ? n.toLocaleString("en") : compact.format(n);
}

async function Home({
  slug,
  range,
}: {
  slug: Promise<string>;
  range: Promise<Range>;
}) {
  const ctx = await requireWorkspace(await slug);
  const r = await range;
  const [counts, quiet, queue, loud, result, activity, days, totals, kb] =
    await Promise.all([
      signalCounts(db, ctx, r),
      shippedNotAnnounced(db, ctx),
      needsYou(db, ctx),
      loudest(db, ctx),
      outcomes(db, ctx, r),
      recentActivity(db, ctx),
      viewsByDay(db, ctx, r),
      summary(db, ctx, r),
      articleStats(db, ctx),
    ]);
  const base = `/dashboard/${ctx.workspaceSlug}`;
  const rated = kb.likes + kb.neutrals + kb.dislikes;

  const todo = [
    queue.inbox.count > 0,
    queue.pendingComments > 0,
    quiet.length > 0,
    !!queue.scheduled,
  ].filter(Boolean).length;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-2 pt-2 pb-10">
      <header className="mb-2">
        <p className="font-mono text-[11px] tracking-[0.08em] text-faint uppercase">
          {today.format(new Date())}
        </p>
        <h1 className="mt-1.5 text-[30px] leading-tight font-semibold">
          {todo === 0
            ? "You're all caught up"
            : `${todo} ${todo === 1 ? "thing needs" : "things need"} you today`}
        </h1>
      </header>

      <section aria-labelledby="signal" className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3.5 pb-1">
          <h2 id="signal" className="font-display text-[15px] font-semibold">
            Signal
          </h2>
          <span className="font-mono text-[11.5px] text-faint">
            last {RANGES[r]} days · from idea to announced
          </span>
          <nav
            aria-label="Date range"
            className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-xs"
          >
            {(Object.keys(RANGES) as Range[]).map((key) => (
              <Link
                key={key}
                href={`${base}?range=${key}`}
                aria-current={key === r ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground",
                  key === r &&
                    "bg-background font-medium text-foreground shadow-[0_0_0_1px_var(--input)]",
                )}
              >
                {RANGE_LABELS[key]}
              </Link>
            ))}
          </nav>
        </div>
        <SignalLine counts={counts} base={base} />
        {quiet.length ? (
          <div className="mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-signal/8 px-3 py-2.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--signal)_22%,transparent)]">
            <Zap className="size-4 shrink-0 text-signal" />
            <p className="min-w-0 flex-1 text-sm">
              <b className="font-semibold">Close the loop:</b>{" "}
              <span className="text-muted-foreground">
                {listTitles(quiet.map((q) => q.title))} shipped, but{" "}
                {voters(quiet.reduce((n, q) => n + Number(q.votes), 0))}{" "}
                haven&apos;t heard yet.
              </span>
            </p>
            <Link
              href={`${base}/updates`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-signal px-3 text-sm font-medium text-white hover:opacity-90"
            >
              Write the update
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <section aria-labelledby="needs" className="rounded-xl border bg-card">
          <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
            <h2 id="needs" className="font-display text-[15px] font-semibold">
              Needs you
            </h2>
            <span className="ml-auto font-mono text-[11px] text-faint">
              clears as you work
            </span>
          </div>
          <ul className="flex flex-col px-1.5 pb-1.5">
            {queue.inbox.count ? (
              <QueueRow
                href={`${base}/feedback/inbox`}
                icon={Inbox}
                title={`${queue.inbox.count} new ${queue.inbox.count === 1 ? "idea" : "ideas"} to triage`}
                detail={
                  queue.inbox.oldestTitle && queue.inbox.oldestAt
                    ? `Oldest: “${queue.inbox.oldestTitle}”, ${ago(queue.inbox.oldestAt)}`
                    : undefined
                }
              />
            ) : null}
            {queue.pendingComments ? (
              <QueueRow
                href={`${base}/feedback/comments`}
                icon={MessageSquare}
                title={`${queue.pendingComments} ${queue.pendingComments === 1 ? "comment waits" : "comments wait"} for approval`}
                detail="Held for review before they show publicly"
              />
            ) : null}
            {quiet.length ? (
              <QueueRow
                href={`${base}/updates`}
                icon={Zap}
                accent
                title={`${quiet.length} shipped ${quiet.length === 1 ? "card" : "cards"} not announced`}
                detail={listTitles(quiet.map((q) => q.title))}
              />
            ) : null}
            {queue.scheduled ? (
              <QueueRow
                href={`${base}/updates/${queue.scheduled.id}`}
                icon={CalendarClock}
                title={`Update scheduled${queue.scheduled.publishAt ? ` for ${when.format(queue.scheduled.publishAt)}` : ""}`}
                detail={`“${queue.scheduled.title}”${queue.drafts ? ` · ${queue.drafts} ${queue.drafts === 1 ? "draft" : "drafts"} waiting` : ""}`}
              />
            ) : null}
            {todo === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nothing waiting. New ideas, comments to approve and shipped work
                to announce show up here.
              </li>
            ) : null}
          </ul>
        </section>

        <section aria-labelledby="loud" className="rounded-xl border bg-card">
          <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
            <h2 id="loud" className="font-display text-[15px] font-semibold">
              Loudest requests
            </h2>
            <Link
              href={`${base}/feedback`}
              className="ml-auto text-[12.5px] text-muted-foreground hover:text-foreground"
            >
              All ideas
            </Link>
          </div>
          {loud.length ? (
            <ol className="flex flex-col px-1.5 pb-2">
              {loud.map((l, i) => (
                <LoudRow key={l.id} rank={i + 1} loud={l} base={base} />
              ))}
            </ol>
          ) : (
            <p className="px-4 pt-4 pb-8 text-center text-sm text-muted-foreground">
              No votes yet. Share your public board to start hearing from
              people.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Outcome
          label="Idea → shipped"
          value={result.medianDays == null ? "–" : `${result.medianDays}`}
          unit={result.medianDays == null ? "" : "days median"}
          note={
            result.priorMedianDays == null
              ? "ideas completed in the last 90 days"
              : `was ${result.priorMedianDays} days the quarter before`
          }
        />
        <Outcome
          label="Loop closed"
          value={result.loopClosed == null ? "–" : `${result.loopClosed}%`}
          unit={result.loopClosed == null ? "" : "of shipped cards announced"}
          note={
            result.shipped
              ? `${result.shipped - result.announced} waiting · aim for 100%`
              : "nothing shipped in the last 90 days"
          }
        />
        <Outcome
          label="Voices heard"
          value={num(result.voters)}
          unit={result.voters === 1 ? "person voted" : "people voted"}
          note={`in the last ${RANGES[r]} days`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.55fr]">
        <section
          aria-labelledby="happened"
          className="rounded-xl border bg-card"
        >
          <h2
            id="happened"
            className="px-4 pt-3.5 pb-1 font-display text-[15px] font-semibold"
          >
            What happened
          </h2>
          {activity.length ? (
            <ul className="flex flex-col px-4 pb-3">
              {activity.map((a) => {
                const place = [a.city, a.country].filter(Boolean).join(", ");
                const href = a.cardId
                  ? `${base}/roadmap?${a.roadmapSlug ? `r=${encodeURIComponent(a.roadmapSlug)}&` : ""}card=${a.cardId}`
                  : `${base}/feedback?feedback=${a.feedbackId}`;
                return (
                  <li
                    key={a.id}
                    className="flex items-baseline gap-2 border-dashed py-2 text-[13px] not-first:border-t"
                  >
                    <span className="min-w-0 flex-1">
                      <b className="font-medium">{a.voterName ?? "Someone"}</b>
                      {place ? (
                        <span className="text-muted-foreground">
                          {" "}
                          from {place}
                        </span>
                      ) : null}{" "}
                      voted on{" "}
                      <Link href={href} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-faint">
                      {ago(a.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 pt-3 pb-8 text-sm text-muted-foreground">
              No votes yet.
            </p>
          )}
        </section>

        <section
          aria-labelledby="traffic"
          className="rounded-xl border bg-card"
        >
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-4 pt-3.5">
            <h2 id="traffic" className="font-display text-[15px] font-semibold">
              Traffic
            </h2>
            <Mini label="Page views" value={totals.views} />
            <Mini label="Visitors" value={totals.visitors} />
            <Mini label="Votes" value={totals.votes} />
            <Mini label="Widget opens" value={totals.widgetViews} />
            <Mini label="Update views" value={totals.postViews} />
            <Mini label="Subscribers" value={totals.subscribers} />
            <Mini label="Article views" value={totals.articleViews} />
            <span className="text-[12px] text-muted-foreground">
              Helpful{" "}
              <b className="font-semibold text-foreground tabular-nums">
                {rated ? `${Math.round((kb.likes / rated) * 100)}%` : "–"}
              </b>
            </span>
          </div>
          <div className="px-4 pt-2 pb-3">
            <ColumnChart
              title="Page views per day"
              unit="views"
              data={days.map((d) => ({
                key: d.day,
                label: dayLabel.format(new Date(`${d.day}T00:00:00Z`)),
                value: d.views,
              }))}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const STAGE_LINKS: Record<Stage, string> = {
  new: "/feedback/inbox",
  review: "/feedback",
  planned: "/roadmap",
  in_progress: "/roadmap",
  shipped: "/roadmap",
  announced: "/updates",
};

/** Six stages side by side: count, a bar sized against the largest, a note. */
function SignalLine({ counts, base }: { counts: SignalCounts; base: string }) {
  const values = STAGES.map((s) => counts[s].count);
  const max = Math.max(1, ...values);
  const notes: Record<Stage, { text: string; tone?: "up" | "warn" }> = {
    new: delta(counts.new.count, counts.new.prior),
    review: {
      text: counts.review.untriaged
        ? `${counts.review.untriaged} untriaged`
        : "inbox clear",
      tone: counts.review.untriaged ? undefined : "up",
    },
    planned: { text: "lined up next" },
    in_progress: { text: "being built" },
    shipped: delta(counts.shipped.count, counts.shipped.prior),
    announced: counts.announced.waiting
      ? { text: `${counts.announced.waiting} shipped, not told`, tone: "warn" }
      : counts.shipped.count
        ? { text: "loop closed", tone: "up" }
        : { text: "nothing to announce" },
  };
  return (
    <ol className="grid grid-cols-2 gap-y-4 px-2 pt-2 pb-4 sm:grid-cols-3 lg:grid-cols-6">
      {STAGES.map((s, i) => {
        const note = notes[s];
        const value = counts[s].count;
        return (
          <li key={s}>
            <Link
              href={`${base}${STAGE_LINKS[s]}`}
              className="group block rounded-lg px-2 pt-2 pb-1.5 hover:bg-muted/60"
            >
              <span
                className="relative block h-1.5 overflow-hidden rounded-full"
                style={{
                  background: `color-mix(in oklab, ${STAGE_COLORS[s]} 22%, transparent)`,
                }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.max(value ? 6 : 0, (value / max) * 100)}%`,
                    background: STAGE_COLORS[s],
                  }}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 -left-10 w-10 bg-linear-to-r from-transparent via-white/70 to-transparent motion-safe:animate-[signal-sweep_3.2s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 0.4}s` }}
                />
              </span>
              <span className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground group-hover:text-foreground">
                <span
                  className="size-[7px] rounded-full"
                  style={{ background: STAGE_COLORS[s] }}
                />
                {s === "new" ? "New ideas" : STAGE_LABELS[s]}
              </span>
              <span className="mt-1.5 block font-display text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
                {num(value)}
              </span>
              <span
                className={cn(
                  "mt-1.5 block font-mono text-[11px] text-faint",
                  note.tone === "up" && "text-stage-shipped",
                  note.tone === "warn" && "text-signal",
                )}
              >
                {note.text}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function delta(now: number, before: number): { text: string; tone?: "up" } {
  if (!before) return { text: now ? "new this period" : "none yet" };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: "same as before" };
  return pct > 0
    ? { text: `+${pct}% vs before`, tone: "up" }
    : { text: `${pct}% vs before` };
}

function listTitles(titles: string[]) {
  const quoted = titles.slice(0, 3).map((t) => `“${t}”`);
  const more = titles.length - quoted.length;
  if (more > 0) return `${quoted.join(", ")} and ${more} more`;
  if (quoted.length < 2) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}

function voters(n: number) {
  return n
    ? `the ${num(n)} ${n === 1 ? "person" : "people"} who voted`
    : "your users";
}

function QueueRow({
  href,
  icon: Icon,
  title,
  detail,
  accent,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-muted/60"
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground",
            accent && "text-signal",
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium">{title}</span>
          {detail ? (
            <span className="truncate text-[12.5px] text-faint">{detail}</span>
          ) : null}
        </span>
        <ArrowRight className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}

function LoudRow({
  rank,
  loud,
  base,
}: {
  rank: number;
  loud: Loud;
  base: string;
}) {
  const href =
    loud.kind === "card"
      ? `${base}/roadmap?${loud.roadmapSlug ? `r=${encodeURIComponent(loud.roadmapSlug)}&` : ""}card=${loud.id}`
      : `${base}/feedback?feedback=${loud.id}`;
  const peak = Math.max(1, ...loud.weeks);
  return (
    <li>
      <Link
        href={href}
        className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_2.5rem] items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/60"
      >
        <span className="font-mono text-[11px] text-faint">
          {String(rank).padStart(2, "0")}
        </span>
        <span className="flex min-w-0 items-center gap-2.5">
          <StageTick stage={loud.stage} />
          <span className="truncate text-[13.5px]">{loud.title}</span>
        </span>
        <span
          className="flex h-4 items-end gap-0.5"
          role="img"
          aria-label={`Votes per week, last 8 weeks: ${loud.weeks.join(", ")}`}
        >
          {loud.weeks.map((w, i) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 8 weeks
              key={i}
              className={cn(
                "w-[3px] rounded-[1px]",
                i === loud.weeks.length - 1 ? "bg-foreground" : "bg-input",
              )}
              style={{ height: `${Math.max(2, (w / peak) * 16)}px` }}
            />
          ))}
        </span>
        <span className="text-right text-[13px] font-semibold tabular-nums">
          {num(loud.votes)}
        </span>
      </Link>
    </li>
  );
}

function Outcome({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="font-mono text-[11px] tracking-[0.08em] text-faint uppercase">
        {label}
      </p>
      <p className="mt-2.5 font-display text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
        {value}
        {unit ? (
          <small className="ml-1.5 font-sans text-[13px] font-normal tracking-normal text-faint">
            {unit}
          </small>
        ) : null}
      </p>
      <p className="mt-2 font-mono text-[11px] text-faint">{note}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-[12px] text-muted-foreground">
      {label}{" "}
      <b
        className="font-semibold text-foreground tabular-nums"
        title={value.toLocaleString("en")}
      >
        {num(value)}
      </b>
    </span>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-2 pt-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-48 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
