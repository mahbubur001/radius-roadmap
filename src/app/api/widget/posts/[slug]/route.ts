import type { NextRequest } from "next/server";
import { loadWidgetPost, loadWidgetSite } from "@/server/widget-cache";
import { preflight, widgetError, widgetRequest } from "@/server/widget-request";

export const OPTIONS = preflight;

/** One post with its body, for the widget's post view. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/widget/posts/[slug]">,
) {
  const req = await widgetRequest(request);
  if (!req) return widgetError("Not found.", 404);
  const site = await loadWidgetSite(
    req.ctx.accountId,
    request.nextUrl.searchParams.get("workspace") ??
      req.site.defaultWorkspace ??
      "",
  );
  if (!site) return widgetError("Not found.", 404);
  const post = await loadWidgetPost(
    req.ctx.accountId,
    site.workspace.id,
    (await ctx.params).slug,
  );
  if (!post) return widgetError("Not found.", 404);
  return req.respond(post);
}
