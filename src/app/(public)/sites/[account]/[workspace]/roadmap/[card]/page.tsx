import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardDetail } from "@/components/public/card-detail";
import { PageView } from "@/components/public/page-view";
import { Skeleton } from "@/components/ui/skeleton";
import { wsPath } from "@/lib/public-path";
import { loadCard, loadSiteForRequest, loadWorkspace } from "../../../data";
import { SiteShell } from "../../../site-shell";

type Props = PageProps<"/sites/[account]/[workspace]/roadmap/[card]">;

async function load(props: Props) {
  const { account, workspace, card } = await props.params;
  const query = await props.searchParams;
  const site = await loadSiteForRequest(decodeURIComponent(account));
  if (!site) return null;
  const ws = await loadWorkspace(site.accountId, workspace);
  if (!ws) return null;
  const found = await loadCard(site.accountId, ws.id, card);
  if (!found) return null;
  return {
    origin: site.publicBase,
    site,
    ws,
    ...found,
    embed: query.embed === "1",
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Not found" };
  const { origin, ws, card, embed } = data;
  const indexable = ws.settings.indexPublicPages !== false && !embed;
  const description =
    card.preview ?? `${card.title} on the ${ws.name} roadmap.`;
  return {
    title: { absolute: `${card.title} · ${ws.name}` },
    description,
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: `${origin}${wsPath(ws)}/roadmap/${card.slug}` },
    openGraph: { title: card.title, description, type: "article" },
  };
}

export default function PublicCardPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 max-w-2xl" />}>
      <PublicCard {...props} />
    </Suspense>
  );
}

async function PublicCard(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { site, ws, card, station, embed } = data;
  return (
    <SiteShell
      account={site.slug}
      workspace={ws}
      active="roadmap"
      embed={embed}
    >
      <PageView cardId={card.id} />
      <div className="mx-auto flex max-w-2xl flex-col gap-5 pt-6 pb-10 md:pt-12">
        <Link
          href={`${site.prefix}${wsPath(ws)}/roadmap${embed ? "?embed=1" : ""}`}
          className="flex w-fit items-center gap-1.5 font-t-mono text-xs font-semibold tracking-[0.12em] text-ink3 uppercase hover:text-foreground"
        >
          <ArrowLeft strokeWidth={1.8} className="size-4" />
          Back to roadmap
        </Link>
        <CardDetail
          card={card}
          station={station}
          commentsEnabled={!!ws.settings.commentsEnabled}
          ideasBase={
            ws.modules.ideas ? `${site.prefix}${wsPath(ws)}/ideas` : null
          }
        />
      </div>
    </SiteShell>
  );
}
