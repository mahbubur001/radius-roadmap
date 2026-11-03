import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import { Chip, PublicBoard } from "@/components/public/public-board";
import { UpdatedLabel } from "@/components/public/updated-label";
import { Skeleton } from "@/components/ui/skeleton";
import { wsPath } from "@/lib/public-path";
import { cn } from "@/lib/utils";
import { loadRoadmap, loadSiteForRequest, loadWorkspace } from "../../data";
import { SiteShell } from "../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/roadmap">;

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

async function load(props: Props) {
  const { account, workspace } = await props.params;
  const query = await props.searchParams;
  const site = await loadSiteForRequest(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws) return null;
  const q = first(query.q)?.trim().slice(0, 100) || undefined;
  const board = first(query.board);
  const roadmap = await loadRoadmap(site.accountId, ws.id, board, q);
  if (!roadmap) return null;
  return {
    origin: site.publicBase,
    site,
    ws,
    roadmap,
    q,
    board,
    embed: first(query.embed) === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, roadmap, embed } = data;
  const indexable = ws.settings.indexPublicPages !== false && !embed;
  return {
    title: { absolute: `${roadmap.title} · ${ws.name}` },
    description: roadmap.summary ?? `What ${ws.name} is working on next.`,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: `${origin}${wsPath(ws)}/roadmap` },
    openGraph: {
      title: `${roadmap.title} · ${ws.name}`,
      description: roadmap.summary ?? undefined,
      type: "website",
    },
  };
}

export default function PublicRoadmapPage(props: Props) {
  return (
    <Suspense fallback={<RoadmapSkeleton />}>
      <PublicRoadmap {...props} />
    </Suspense>
  );
}

async function PublicRoadmap(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, roadmap, q, embed, board } = data;
  const base = `${site.prefix}${wsPath(ws)}/roadmap`;

  return (
    <SiteShell
      account={site.slug}
      workspace={ws}
      active="roadmap"
      embed={embed}
    >
      <PageView />
      {embed ? null : (
        <div className="grid items-end gap-5 pt-7 pb-[22px] md:grid-cols-[1.3fr_1fr] md:gap-12 md:pt-14 md:pb-10">
          <div>
            <div className="font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase">
              {ws.name} · public roadmap
            </div>
            <h1
              className={
                roadmap.display.showTitle
                  ? "mt-2.5 mb-2.5 font-t-display text-[38px] leading-none font-bold tracking-[-0.035em] md:mt-3.5 md:mb-4 md:text-[clamp(40px,5.2vw,68px)]"
                  : "sr-only"
              }
            >
              <BrandLastWord text={roadmap.title} />
            </h1>
            {roadmap.summaryHtml ? (
              <div
                className="rich-text max-w-[520px] text-[15.5px] text-muted-foreground md:text-[17px]"
                // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
                dangerouslySetInnerHTML={{ __html: roadmap.summaryHtml }}
              />
            ) : null}
          </div>
          <Scoreboard stats={roadmap.stats} />
        </div>
      )}
      {ws.roadmaps.length > 1 ? (
        <nav
          aria-label="Roadmaps"
          className={cn(
            "-mx-[18px] mb-3.5 flex gap-2.5 overflow-x-auto px-[18px] [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0",
            embed && "pt-1",
          )}
        >
          {ws.roadmaps.map((r) => (
            <Chip
              key={r.id}
              on={r.id === roadmap.id}
              href={`${base}?board=${r.slug}${embed ? "&embed=1" : ""}`}
            >
              {r.title}
            </Chip>
          ))}
        </nav>
      ) : null}
      <PublicBoard
        columns={roadmap.columns}
        cards={roadmap.cards}
        cardHref={base}
        ideasBase={
          ws.modules.ideas ? `${site.prefix}${wsPath(ws)}/ideas` : null
        }
        query={q ?? ""}
        embed={embed}
        commentsEnabled={!!ws.settings.commentsEnabled}
        searchAction={base}
        board={board}
      />
    </SiteShell>
  );
}

/** The hero title with its last word in the brand colour (decision 1). */
function BrandLastWord({ text }: { text: string }) {
  const at = text.trimEnd().lastIndexOf(" ");
  if (at < 0) return <span className="text-primary">{text}</span>;
  return (
    <>
      {text.slice(0, at + 1)}
      <span className="text-primary">{text.slice(at + 1)}</span>
    </>
  );
}

/** The dark scoreboard (doc 32 decision 3): live counts per stage. */
function Scoreboard({
  stats,
}: {
  stats: {
    now: number;
    next: number;
    later: number;
    shippedThisYear: number;
    updatedAt: string | null;
  };
}) {
  const rows = [
    ["Now", stats.now, "in progress"],
    ["Next", stats.next, "planned"],
    ["Later", stats.later, "considering"],
    ["Shipped", stats.shippedThisYear, "this year"],
  ] as const;
  return (
    <div className="grid grid-cols-4 rounded-2xl bg-foreground px-3 py-3.5 font-t-mono text-background md:block md:rounded-[18px] md:px-5 md:py-[18px]">
      <div className="col-span-full mb-1.5 flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase opacity-70">
        <i className="size-[7px] animate-[transit-ping_2s_infinite] rounded-full bg-[#3ddc84] shadow-[0_0_0_0_#3ddc84]" />
        Live
        <UpdatedLabel iso={stats.updatedAt} />
      </div>
      {rows.map(([k, v, small], i) => (
        <div
          key={k}
          className={cn(
            "flex flex-col-reverse items-start border-dashed border-background/18 px-1.5 py-1 md:grid md:grid-cols-[1fr_auto] md:items-baseline md:border-b md:px-0 md:py-[9px] md:last:border-b-0",
            i > 0 && "border-l md:border-l-0",
          )}
        >
          <span className="text-[9.5px] tracking-[0.08em] uppercase opacity-65 md:text-xs md:tracking-[0.14em]">
            {k}
          </span>
          <span className="text-[22px] font-bold tracking-[-0.02em] md:text-[30px]">
            {String(v).padStart(2, "0")}
            <small className="ml-1.5 hidden text-xs font-medium opacity-55 md:inline">
              {small}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}

function RoadmapSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl gap-4 p-8">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-96 w-72 shrink-0" />
      ))}
    </div>
  );
}
