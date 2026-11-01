import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { hit } from "@/server/rate-limit";
import { trackEvent } from "@/server/services/events";
import { loadWidgetSite } from "@/server/widget-cache";
import { preflight, widgetError, widgetRequest } from "@/server/widget-request";

export const OPTIONS = preflight;

const schema = z.object({ workspace: z.string().trim().min(1).max(64) });

/** The widget was opened (Home: widget views). */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return widgetError("Invalid request.", 400);
  const req = await widgetRequest(request);
  if (!req) return widgetError("Not found.", 404);
  const site = await loadWidgetSite(req.ctx.accountId, parsed.data.workspace);
  if (!site) return widgetError("Not found.", 404);
  const allowed = await hit([
    { key: `widget-view:${req.visitorId}`, max: 30, windowSeconds: 3600 },
  ]);
  if (allowed) {
    await trackEvent(db, req.ctx, {
      workspaceId: site.workspace.id,
      type: "widget_view",
      visitorId: req.visitorId,
      ...req.location,
      source: "widget",
    });
  }
  return req.respond({ ok: true });
}
