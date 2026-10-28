import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import { PublicBoard } from "@/components/public/public-board";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { loadRoadmap, loadSite, loadWorkspace, siteUrl } from "../../data";
import { SiteShell } from "../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/roadmap">;

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

async function load(props: Props) {
  const { account, workspace } = await props.params;
  const query = await props.searchParams;
  const site = await loadSite(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws) return null;
  const q = first(query.q)?.trim().slice(0, 100) || undefined;
  const board = first(query.board);
  const roadmap = await loadRoadmap(site.accountId, ws.id, board, q);
  if (!roadmap) return null;
  return {
    origin: siteUrl(site.slug),
    site,
    ws,
    roadmap,
    q,
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
    alternates: { canonical: `${origin}/${ws.slug}/roadmap` },
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
  const { site, ws, roadmap, q, embed } = data;
  const base = `/${site.slug}/${ws.slug}/roadmap`;

  return (
    <SiteShell account={site.slug} workspace={ws} embed={embed}>
      <PageView />
      <div className="flex flex-col gap-6">
        {embed ? null : (
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {roadmap.title}
            </h1>
            {roadmap.summary ? (
              <p className="max-w-2xl text-muted-foreground">
                {roadmap.summary}
              </p>
            ) : null}
          </div>
        )}
        {ws.roadmaps.length > 1 ? (
          <nav className="flex gap-1 text-sm" aria-label="Roadmaps">
            {ws.roadmaps.map((r) => (
              <Link
                key={r.id}
                href={`${base}?board=${r.slug}${embed ? "&embed=1" : ""}`}
                className={cn(
                  "rounded-md px-3 py-1.5",
                  r.id === roadmap.id
                    ? "bg-muted font-medium"
                    : "text-muted-foreground",
                )}
              >
                {r.title}
              </Link>
            ))}
          </nav>
        ) : null}
        <PublicBoard
          columns={roadmap.columns}
          cards={roadmap.cards}
          cardHref={base}
          showCompletedToggle={roadmap.display.showCompleted}
          query={q ?? ""}
          searchAction={base}
          embed={embed}
        />
      </div>
    </SiteShell>
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
