import type { NextRequest } from "next/server";
import { subscribeSchema } from "@/lib/schemas/updates";
import { db } from "@/server/db/client";
import { notFound, publicRequest, siteOrigin } from "@/server/public-request";
import { enqueueEmail } from "@/server/queue/email";
import { notify } from "@/server/queue/notifications";
import { hit, SUBSCRIBE_LIMITS } from "@/server/rate-limit";
import { trackEvent } from "@/server/services/events";
import { getPublicWorkspaceById } from "@/server/services/public-site";
import { subscribe } from "@/server/services/subscribers";
import { verifyTurnstile } from "@/server/turnstile";

/**
 * "Get updates by email" (doc 23 U1). Logged-in voters with a verified email
 * are subscribed at once; everyone else gets a confirmation email first.
 */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = subscribeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return req.respond(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const ws = await getPublicWorkspaceById(db, req.ctx, parsed.data.workspaceId);
  if (!ws?.modules.updates) return notFound();

  const verified = !!req.voter?.emailVerifiedAt && !parsed.data.email;
  const email = verified ? req.voter?.email : parsed.data.email;
  if (!email) {
    return req.respond({ error: "Enter your email." }, { status: 400 });
  }
  if (
    !verified &&
    !(await verifyTurnstile(parsed.data.turnstileToken, req.ip))
  ) {
    return req.respond(
      { error: "Couldn't verify you're human. Try again." },
      { status: 403 },
    );
  }
  const allowed = await hit([
    {
      key: `subscribe:ip:${req.ipHash ?? req.visitorId}`,
      max: SUBSCRIBE_LIMITS.perIpHour,
      windowSeconds: 3600,
    },
    {
      key: `subscribe:email:${req.ctx.accountId}:${email}`,
      max: SUBSCRIBE_LIMITS.perEmailHour,
      windowSeconds: 3600,
    },
  ]);
  if (!allowed) {
    return req.respond(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const result = await subscribe(db, req.ctx, {
    workspaceId: ws.id,
    email,
    trackedUserId: verified ? req.voter?.id : null,
    verified,
  });
  if (result.status === "pending") {
    const url = new URL("/api/public/subscribe/confirm", siteOrigin(request));
    url.searchParams.set("site", req.site.slug);
    url.searchParams.set("token", result.token);
    await enqueueEmail({
      template: "subscribe-confirm",
      to: email,
      props: { siteName: ws.name, url: url.toString() },
    });
  } else if (result.activated) {
    await notify({ type: "new-subscriber", subscriberId: result.id });
    await trackEvent(db, req.ctx, {
      workspaceId: ws.id,
      type: "subscribe",
      visitorId: req.visitorId,
      ...req.location,
      source: req.embed ? "embed" : "public",
    });
  }
  // Same answer whether or not the address was already subscribed.
  return req.respond({ status: result.status });
}
