import { loadSite, siteUrl } from "../data";

/** Allows crawling (per-workspace noindex is set on the pages themselves). */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/sites/[host]/robots.txt">,
) {
  const host = decodeURIComponent((await ctx.params).host);
  const site = await loadSite(host);
  if (!site) return new Response("Not found", { status: 404 });
  const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl(host)}/sitemap.xml
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
