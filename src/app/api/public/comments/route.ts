import type { NextRequest } from "next/server";
import {
  commentTargetSchema,
  publicCommentSchema,
} from "@/lib/schemas/comments";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import { publicCommentTarget } from "@/server/public-comment-target";
import { notFound, publicRequest } from "@/server/public-request";
import { COMMENT_LIMITS, hit } from "@/server/rate-limit";
import {
  addPublicComment,
  listPublicComments,
} from "@/server/services/comments";
import { trackEvent } from "@/server/services/events";
import { verifyTurnstile } from "@/server/turnstile";

/** Public comments on an idea or card (approved, never internal notes). */
export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const params = request.nextUrl.searchParams;
  const parsed = commentTargetSchema.safeParse({
    feedbackId: params.get("feedbackId") ?? undefined,
    cardId: params.get("cardId") ?? undefined,
  });
  if (!parsed.success) return notFound();
  const found = await publicCommentTarget(db, req.ctx, parsed.data);
  if (!found) return notFound();
  return req.respond({
    comments: await listPublicComments(db, req.ctx, found.target),
  });
}

/**
 * A visitor comments (doc 20 D3). Logged-in voters only (guest or email
 * code); unverified guests pass Turnstile; held for approval when the
 * workspace says so.
 */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = publicCommentSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return req.respond(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const found = await publicCommentTarget(db, req.ctx, parsed.data);
  if (!found) return notFound();
  if (!req.voter) {
    return req.respond(
      { error: "Log in to comment.", signIn: true },
      { status: 401 },
    );
  }
  if (
    !req.voter.emailVerifiedAt &&
    !(await verifyTurnstile(parsed.data.turnstileToken, req.ip))
  ) {
    return req.respond(
      { error: "Couldn't verify you're human. Try again." },
      { status: 403 },
    );
  }
  const ipKey = req.ipHash ?? req.visitorId;
  const allowed = await hit([
    {
      key: `comment:ip:h:${ipKey}`,
      max: COMMENT_LIMITS.perIpHour,
      windowSeconds: 3600,
    },
    {
      key: `comment:ip:d:${ipKey}`,
      max: COMMENT_LIMITS.perIpDay,
      windowSeconds: 86_400,
    },
  ]);
  if (!allowed) {
    return req.respond(
      { error: "Too many comments from here. Try again later." },
      { status: 429 },
    );
  }

  const row = await addPublicComment(db, req.ctx, {
    target: found.target,
    workspaceId: found.workspaceId,
    body: parsed.data.body,
    trackedUserId: req.voter.id,
    holdForApproval: found.holdForApproval,
  });
  await trackEvent(db, req.ctx, {
    workspaceId: found.workspaceId,
    type: "comment",
    subjectId: row.feedbackId ?? row.cardId,
    visitorId: req.visitorId,
    ...req.location,
    source: req.embed ? "embed" : "public",
  });
  if (row.review === "approved") invalidatePublic(found.workspaceId);
  return req.respond({
    comment: {
      id: row.id,
      body: row.body,
      author: req.voter.name?.trim() || "Guest",
      team: false,
      createdAt: row.createdAt.toISOString(),
      edited: false,
    },
    pending: row.review === "pending",
  });
}
