import { db } from "@/server/db/client";
import { listSitemapEntries } from "@/server/services/public-site";
import { loadSite, loadWorkspaces, siteUrl } from "../data";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Roadmap and card URLs of workspaces that allow indexing. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/sites/[host]/sitemap.xml">,
) {
  const host = decodeURIComponent((await ctx.params).host);
  const site = await loadSite(host);
  if (!site) return new Response("Not found", { status: 404 });
  const origin = siteUrl(host);
  const [workspaces, cards] = await Promise.all([
    loadWorkspaces(site.accountId),
    listSitemapEntries(db, { accountId: site.accountId }),
  ]);
  const urls = [
    ...workspaces
      .filter((w) => w.settings.indexPublicPages !== false)
      .map((w) => ({ loc: `${origin}/${w.slug}/roadmap`, lastmod: null })),
    ...cards
      .filter((c) => c.indexable)
      .map((c) => ({
        loc: `${origin}/${c.workspace}/roadmap/${c.card}`,
        lastmod: c.updatedAt.toISOString(),
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
