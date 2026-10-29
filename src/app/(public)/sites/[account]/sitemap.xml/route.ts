import { db } from "@/server/db/client";
import { listArticleSitemapEntries } from "@/server/services/public-articles";
import { listIdeaSitemapEntries } from "@/server/services/public-ideas";
import { listSitemapEntries } from "@/server/services/public-site";
import { listUpdateSitemapEntries } from "@/server/services/public-updates";
import { loadSite, loadWorkspace, loadWorkspaces, siteUrl } from "../data";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Module, card, post, idea and article URLs of workspaces that allow indexing. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/sites/[account]/sitemap.xml">,
) {
  const site = await loadSite(decodeURIComponent((await ctx.params).account));
  if (!site) return new Response("Not found", { status: 404 });
  const origin = siteUrl(site.slug);
  const scope = { accountId: site.accountId };
  const [workspaces, cards, ideas, posts, articles] = await Promise.all([
    loadWorkspaces(site.accountId),
    listSitemapEntries(db, scope),
    listIdeaSitemapEntries(db, scope),
    listUpdateSitemapEntries(db, scope),
    listArticleSitemapEntries(db, scope),
  ]);
  const modules = await Promise.all(
    workspaces
      .filter((w) => w.settings.indexPublicPages !== false)
      .map((w) => loadWorkspace(site.accountId, w.slug)),
  );
  const urls = [
    ...modules.flatMap((w) =>
      w
        ? (["roadmap", "updates", "ideas", "articles"] as const)
            .filter((m) => w.modules[m])
            .map((m) => ({ loc: `${origin}/${w.slug}/${m}`, lastmod: null }))
        : [],
    ),
    ...cards
      .filter((c) => c.indexable)
      .map((c) => ({
        loc: `${origin}/${c.workspace}/roadmap/${c.card}`,
        lastmod: c.updatedAt.toISOString(),
      })),
    ...posts
      .filter((p) => p.indexable)
      .map((p) => ({
        loc: `${origin}/${p.workspace}/updates/${p.post}`,
        lastmod: p.updatedAt.toISOString(),
      })),
    ...articles
      .filter((a) => a.indexable)
      .map((a) => ({
        loc: `${origin}/${a.workspace}/articles/${a.article}`,
        lastmod: a.updatedAt.toISOString(),
      })),
    ...ideas
      .filter((i) => i.indexable)
      .map((i) => ({
        loc: `${origin}/${i.workspace}/ideas/${i.idea}`,
        lastmod: i.updatedAt.toISOString(),
      })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
