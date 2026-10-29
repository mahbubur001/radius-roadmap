import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IdeaDetail } from "@/components/public/idea-detail";
import { PageView } from "@/components/public/page-view";
import { Skeleton } from "@/components/ui/skeleton";
import { loadIdea, loadSite, loadWorkspace, siteUrl } from "../../../data";
import { SiteShell } from "../../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/ideas/[idea]">;

async function load(props: Props) {
  const { account, workspace, idea } = await props.params;
  const query = await props.searchParams;
  const site = await loadSite(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.ideas) return null;
  const found = await loadIdea(site.accountId, ws.id, idea);
  if (!found) return null;
  return {
    origin: siteUrl(site.slug),
    site,
    ws,
    idea: found,
    embed: query.embed === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, idea, embed } = data;
  const indexable = ws.settings.indexPublicPages !== false && !embed;
  const description = idea.preview ?? `${idea.title}: an idea for ${ws.name}.`;
  return {
    title: { absolute: `${idea.title} · ${ws.name}` },
    description,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: `${origin}/${ws.slug}/ideas/${idea.slug}` },
    openGraph: { title: idea.title, description, type: "article" },
  };
}

export default function PublicIdeaPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-2xl" />}>
      <Idea {...props} />
    </Suspense>
  );
}

async function Idea(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, idea, embed } = data;
  const suffix = embed ? "?embed=1" : "";
  return (
    <SiteShell account={site.slug} workspace={ws} active="ideas" embed={embed}>
      <PageView ideaId={idea.id} />
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link
          href={`/${site.slug}/${ws.slug}/ideas${suffix}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to ideas
        </Link>
        <div className="overflow-hidden rounded-lg border bg-card">
          <IdeaDetail
            idea={idea}
            commentsEnabled={!!ws.settings.commentsEnabled}
            tags={idea.tags}
            roadmapHref={
              idea.roadmapCard && ws.modules.roadmap
                ? `/${site.slug}/${ws.slug}/roadmap/${idea.roadmapCard}${suffix}`
                : null
            }
          />
        </div>
      </div>
    </SiteShell>
  );
}
