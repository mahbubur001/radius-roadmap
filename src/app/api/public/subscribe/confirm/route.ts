import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { publicRequest, siteOrigin } from "@/server/public-request";
import { notify } from "@/server/queue/notifications";
import { trackEvent } from "@/server/services/events";
import { confirmSubscription } from "@/server/services/subscribers";
import { simplePage } from "@/server/simple-page";

/** The link in the confirmation email (`?site=&token=`). */
export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const sub =
    req && token.length >= 20 && token.length <= 100
      ? await confirmSubscription(db, req.ctx, token)
      : null;
  if (!req || !sub) {
    return simplePage(
      "Link expired",
      "<h1>This link doesn't work any more</h1><p>Subscribe again from the Updates page to get a new one.</p>",
      404,
    );
  }
  if (sub.activated) {
    await notify({ type: "new-subscriber", subscriberId: sub.id });
    await trackEvent(db, req.ctx, {
      workspaceId: sub.workspaceId,
      type: "subscribe",
      visitorId: req.visitorId,
      source: "public",
    });
  }
  return NextResponse.redirect(
    new URL(
      `/${req.site.slug}/${sub.workspaceSlug}/updates?subscribed=1`,
      siteOrigin(request),
    ),
    303,
  );
}
