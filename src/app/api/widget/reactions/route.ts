import type { NextRequest } from "next/server";
import { REACTIONS, type ReactionKey } from "@/lib/reactions";
import { widgetReactionSchema } from "@/lib/schemas/widget";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import { hit } from "@/server/rate-limit";
import { trackEvent } from "@/server/services/events";
import { getReactablePost } from "@/server/services/public-updates";
import { toggleReaction } from "@/server/services/reactions";
import { loadWidgetSite } from "@/server/widget-cache";
import { preflight, widgetError, widgetRequest } from "@/server/widget-request";

export const OPTIONS = preflight;

const EMOJI = new Set<string>(REACTIONS.map((r) => r.key));

/** Toggle an emoji reaction from the widget (same rules as the site). */
export async function POST(request: NextRequest) {
  const parsed = widgetReactionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || !EMOJI.has(parsed.data.emoji)) {
    return widgetError("Invalid request.", 400);
  }
  const req = await widgetRequest(request);
  if (!req) return widgetError("Not found.", 404);
  const site = await loadWidgetSite(req.ctx.accountId, parsed.data.workspace);
  if (!site?.settings.reactions) return widgetError("Not found.", 404);
  const post = await getReactablePost(db, req.ctx, parsed.data.updateId);
  if (!post || post.workspaceId !== site.workspace.id) {
    return widgetError("Not found.", 404);
  }
  const allowed = await hit([
    {
      key: `reaction:ip:${req.ipHash ?? req.visitorId}`,
      max: 60,
      windowSeconds: 3600,
    },
  ]);
  if (!allowed) return widgetError("Too many reactions. Try again later.", 429);

  const result = await toggleReaction(
    db,
    req.ctx,
    post.id,
    parsed.data.emoji as ReactionKey,
    req.voter,
  );
  if (result.reacted) {
    await trackEvent(db, req.ctx, {
      workspaceId: post.workspaceId,
      type: "reaction",
      subjectId: post.id,
      visitorId: req.visitorId,
      ...req.location,
      source: "widget",
    });
  }
  invalidatePublic(post.workspaceId);
  return req.respond({ ...result, visitor: req.visitorToken });
}
