import type { NextRequest } from "next/server";
import { widgetFeedbackSchema } from "@/lib/schemas/widget";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import { notify } from "@/server/queue/notifications";
import { hit, SUBMIT_LIMITS } from "@/server/rate-limit";
import { trackEvent } from "@/server/services/events";
import { submitIdea } from "@/server/services/public-ideas";
import { loadWidgetSite } from "@/server/widget-cache";
import { preflight, widgetError, widgetRequest } from "@/server/widget-request";

export const OPTIONS = preflight;

/**
 * "Send feedback" from the widget: a new idea on the workspace's first
 * public board. Users the customer's app vouched for (signed token) follow
 * the board's rules; everyone else goes to the triage inbox (doc 26 6B).
 */
export async function POST(request: NextRequest) {
  const parsed = widgetFeedbackSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return widgetError(
      parsed.error.issues[0]?.message ?? "Invalid request.",
      400,
    );
  }
  const input = parsed.data;
  const req = await widgetRequest(request, {
    name: input.name,
    email: input.email,
  });
  if (!req) return widgetError("Not found.", 404);
  if (!req.identity) return widgetError("Enter your email.", 400);
  const site = await loadWidgetSite(req.ctx.accountId, input.workspace);
  if (!site?.board) return widgetError("Not found.", 404);

  const ipKey = req.ipHash ?? req.visitorId;
  const allowed = await hit([
    {
      key: `submit:ip:h:${ipKey}`,
      max: SUBMIT_LIMITS.perIpHour,
      windowSeconds: 3600,
    },
    {
      key: `submit:ip:d:${ipKey}`,
      max: SUBMIT_LIMITS.perIpDay,
      windowSeconds: 86_400,
    },
  ]);
  if (!allowed) {
    return widgetError("Too much feedback from here. Try again later.", 429);
  }

  const item = await submitIdea(db, req.ctx, {
    workspaceId: site.workspace.id,
    board: site.board,
    title: input.title,
    details: input.details,
    trackedUserId: req.identity.user.id,
    source: "widget",
    review: !req.identity.verified,
  });
  await trackEvent(db, req.ctx, {
    workspaceId: site.workspace.id,
    type: "feedback_submit",
    subjectId: item.id,
    visitorId: req.visitorId,
    ...req.location,
    source: "widget",
  });
  if (item.review === "approved") invalidatePublic(site.workspace.id);
  await notify({ type: "new-feedback", feedbackId: item.id });
  return req.respond({ ok: true, pending: item.review === "pending" });
}
