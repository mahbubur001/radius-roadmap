import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageView } from "@/components/public/page-view";
import { PublicUpdates } from "@/components/public/public-updates";
import { Skeleton } from "@/components/ui/skeleton";
import { loadSite, loadUpdates, loadWorkspace, siteUrl } from "../../data";
import { SiteShell } from "../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/updates">;

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

async function load(props: Props) {
  const { account, workspace } = await props.params;
  const query = await props.searchParams;
  const site = await loadSite(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws?.modules.updates) return null;
  const q = first(query.q)?.trim().slice(0, 100) || undefined;
  const category = first(query.category)?.slice(0, 40) || undefined;
  const data = await loadUpdates(site.accountId, ws.id, {
    q,
    category:
      category && /^[0-9a-f-]{36}$/.test(category) ? category : undefined,
  });
  return {
    origin: siteUrl(site.slug),
    site,
    ws,
    data,
    q,
    category,
    embed: first(query.embed) === "1",
    subscribed: first(query.subscribed) === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, embed } = data;
  const indexable = ws.settings.indexPublicPages !== false && !embed;
  return {
    title: { absolute: `Updates · ${ws.name}` },
    description: `What's new in ${ws.name}.`,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: {
      canonical: `${origin}/${ws.slug}/updates`,
      types: {
        "application/rss+xml": `${origin}/${ws.slug}/updates/feed.xml`,
      },
    },
  };
}

export default function PublicUpdatesPage(props: Props) {
  return (
    <Suspense
      fallback={<Skeleton className="mx-auto mt-10 h-96 w-full max-w-3xl" />}
    >
      <Updates {...props} />
    </Suspense>
  );
}

async function Updates(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, q, category, embed, subscribed } = data;
  return (
    <SiteShell
      account={site.slug}
      workspace={ws}
      active="updates"
      embed={embed}
    >
      <PageView />
      <div className="flex flex-col gap-6">
        {embed ? null : (
          <h1 className="text-3xl font-semibold tracking-tight">Updates</h1>
        )}
        <PublicUpdates
          base={`/${site.slug}/${ws.slug}/updates`}
          posts={data.data.posts}
          categories={data.data.categories}
          query={q ?? ""}
          category={category ?? ""}
          embed={embed}
          roadmapBase={
            ws.modules.roadmap ? `/${site.slug}/${ws.slug}/roadmap` : null
          }
          justSubscribed={subscribed}
        />
      </div>
    </SiteShell>
  );
}
