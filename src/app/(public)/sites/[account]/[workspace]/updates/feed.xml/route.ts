import { loadSite, loadUpdates, loadWorkspace, siteUrl } from "../../../data";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** RSS 2.0 feed of a workspace's public updates (doc 23 U6). */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/sites/[account]/[workspace]/updates/feed.xml">,
) {
  const { account, workspace } = await ctx.params;
  const site = await loadSite(decodeURIComponent(account));
  const ws = site ? await loadWorkspace(site.accountId, workspace) : null;
  if (!site || !ws?.modules.updates) {
    return new Response("Not found", { status: 404 });
  }
  const { posts } = await loadUpdates(site.accountId, ws.id, {});
  const base = `${siteUrl(site.slug)}/${ws.slug}/updates`;
  const items = posts
    .slice(0, 50)
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(`${base}/${p.slug}`)}</link>
      <guid isPermaLink="true">${escapeXml(`${base}/${p.slug}`)}</guid>
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>${
        p.category
          ? `\n      <category>${escapeXml(p.category.name)}</category>`
          : ""
      }
      <description>${escapeXml(p.excerpt ?? "")}</description>
    </item>`,
    )
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(`${ws.name} updates`)}</title>
    <link>${escapeXml(base)}</link>
    <description>${escapeXml(`What's new in ${ws.name}.`)}</description>
${items}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600",
    },
  });
}
