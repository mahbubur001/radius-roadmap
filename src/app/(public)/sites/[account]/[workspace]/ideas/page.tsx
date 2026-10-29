import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import { PublicIdeas } from "@/components/public/public-ideas";
import { Skeleton } from "@/components/ui/skeleton";
import { IDEA_SORTS, type IdeaSort } from "@/server/services/public-ideas";
import { loadIdeas, loadSite, loadWorkspace, siteUrl } from "../../data";
import { SiteShell } from "../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/ideas">;

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

async function load(props: Props) {
  const { account, workspace } = await props.params;
  const query = await props.searchParams;
  const site = await loadSite(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.ideas) return null;
  const q = first(query.q)?.trim().slice(0, 100) || undefined;
  const sortParam = first(query.sort);
  const sort =
    IDEA_SORTS.find((s) => s === sortParam) ?? ("trending" as IdeaSort);
  const status = first(query.status)?.slice(0, 40) || undefined;
  const ideas = await loadIdeas(site.accountId, ws.id, {
    board: first(query.board),
    q,
    sort,
    status,
  });
  if (!ideas) return null;
  return {
    origin: siteUrl(site.slug),
    site,
    ws,
    ideas,
    q,
    status,
    embed: first(query.embed) === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, embed } = data;
  const indexable = ws.settings.indexPublicPages !== false && !embed;
  return {
    title: { absolute: `Ideas · ${ws.name}` },
    description: `Suggest and vote on ideas for ${ws.name}.`,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: `${origin}/${ws.slug}/ideas` },
  };
}

export default function PublicIdeasPage(props: Props) {
  return (
    <Suspense fallback={<IdeasSkeleton />}>
      <Ideas {...props} />
    </Suspense>
  );
}

async function Ideas(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, ideas, q, status, embed } = data;
  return (
    <SiteShell account={site.slug} workspace={ws} active="ideas" embed={embed}>
      <PageView />
      <div className="flex flex-col gap-6">
        {embed ? null : (
          <div className="flex flex-col gap-2 border-b pb-6">
            <h1 className="text-3xl font-semibold tracking-tight">Ideas</h1>
            {ideas.board.description ? (
              <p className="max-w-2xl text-muted-foreground">
                {ideas.board.description}
              </p>
            ) : null}
          </div>
        )}
        <PublicIdeas
          base={`/${site.slug}/${ws.slug}/ideas`}
          board={ideas.board}
          boards={ideas.boards}
          statuses={ideas.statuses}
          items={ideas.items}
          sort={ideas.sort}
          status={status ?? ""}
          query={q ?? ""}
          embed={embed}
          commentsEnabled={!!ws.settings.commentsEnabled}
          followsEnabled={!!ws.settings.followsEnabled}
          termsUrl={ws.settings.termsUrl ?? null}
          privacyUrl={ws.settings.privacyUrl ?? null}
        />
      </div>
    </SiteShell>
  );
}

function IdeasSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-8">
      <Skeleton className="h-10 w-48" />
      <div className="flex gap-8">
        <Skeleton className="h-96 flex-1" />
        <Skeleton className="hidden h-96 w-80 lg:block" />
      </div>
    </div>
  );
}
