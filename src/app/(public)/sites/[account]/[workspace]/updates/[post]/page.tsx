import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import { UpdateDetail } from "@/components/public/update-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { loadSite, loadUpdate, loadWorkspace, siteUrl } from "../../../data";
import { SiteShell } from "../../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/updates/[post]">;

async function load(props: Props) {
  const { account, workspace, post } = await props.params;
  const query = await props.searchParams;
  const site = await loadSite(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.updates) return null;
  const found = await loadUpdate(site.accountId, ws.id, post);
  if (!found) return null;
  return {
    origin: siteUrl(site.slug),
    site,
    ws,
    post: found,
    embed: query.embed === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, post, embed } = data;
  const indexable = ws.settings.indexPublicPages !== false && !embed;
  const description = post.excerpt ?? `${post.title}: news from ${ws.name}.`;
  return {
    title: { absolute: `${post.title} · ${ws.name}` },
    description,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: `${origin}/${ws.slug}/updates/${post.slug}` },
    openGraph: {
      title: post.title,
      description,
      type: "article",
      publishedTime: post.publishedAt,
      images: post.cover ? [post.cover] : undefined,
    },
  };
}

export default function PublicPostPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-3xl" />}>
      <Post {...props} />
    </Suspense>
  );
}

async function Post(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, post, embed } = data;
  const suffix = embed ? "?embed=1" : "";
  return (
    <SiteShell
      account={site.slug}
      workspace={ws}
      active="updates"
      embed={embed}
    >
      <PageView postId={post.id} />
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Link
          href={`/${site.slug}/${ws.slug}/updates${suffix}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All updates
        </Link>
        <div className="overflow-hidden rounded-lg border bg-card">
          <UpdateDetail
            post={post}
            roadmapBase={
              ws.modules.roadmap ? `/${site.slug}/${ws.slug}/roadmap` : null
            }
          />
        </div>
      </div>
    </SiteShell>
  );
}
