import type { NextRequest } from "next/server";
import { REACTIONS } from "@/lib/reactions";
import { db } from "@/server/db/client";
import { publicSiteUrl } from "@/server/public-url";
import { myReactions } from "@/server/services/reactions";
import { loadWidgetSite } from "@/server/widget-cache";
import { preflight, widgetError, widgetRequest } from "@/server/widget-request";

export const OPTIONS = preflight;

/**
 * Everything the widget needs on load: settings, latest posts, the
 * visitor's own reactions and (when issued) a new visitor id.
 * `?site=<account>&workspace=<slug>`; no workspace = the default one.
 */
export async function GET(request: NextRequest) {
  const req = await widgetRequest(request);
  if (!req) return widgetError("Not found.", 404);
  const slug =
    request.nextUrl.searchParams.get("workspace") ??
    req.site.defaultWorkspace ??
    "";
  const loaded = await loadWidgetSite(req.ctx.accountId, slug);
  if (!loaded) return widgetError("Not found.", 404);
  const { customHost, ...site } = loaded;
  const mine = await myReactions(db, req.ctx, site.workspace.id, req.voter);
  return req.respond({
    ...site,
    siteUrl: publicSiteUrl(
      req.site.slug,
      site.workspace.slug,
      req.site.defaultWorkspace,
      customHost,
    ),
    mine,
    /** The widget has no copy of the emoji list. */
    emoji: REACTIONS.map((r) => ({
      key: r.key,
      emoji: r.emoji,
      label: r.label,
    })),
    user: req.identity
      ? {
          name: req.identity.user.name,
          email: req.identity.user.email,
          verified: req.identity.verified,
        }
      : null,
    visitor: req.visitorToken,
  });
}
