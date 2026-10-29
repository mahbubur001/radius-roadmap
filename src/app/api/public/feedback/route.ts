import type { NextRequest } from "next/server";
import { submitIdeaSchema } from "@/lib/schemas/feedback";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import { notFound, publicRequest } from "@/server/public-request";
import { hit, SUBMIT_LIMITS } from "@/server/rate-limit";
import { NotFoundError } from "@/server/services/context";
import { trackEvent } from "@/server/services/events";
import { submitIdea } from "@/server/services/public-ideas";
import { getPublicWorkspaceById } from "@/server/services/public-site";
import { verifyTurnstile } from "@/server/turnstile";

/**
 * A visitor submits an idea (doc 20 §4.2, D2, D6). They must be signed in
 * (guest or email code); unverified guests also pass Turnstile. New ideas go
 * to the team's triage inbox unless the board auto-publishes.
 */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();

  const parsed = submitIdeaSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return req.respond(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const ws = await getPublicWorkspaceById(db, req.ctx, input.workspaceId);
  if (!ws?.modules.ideas) return notFound();

  if (!req.voter) {
    return req.respond(
      { error: "Log in to submit an idea.", signIn: true },
      { status: 401 },
    );
  }
  if ((ws.settings.termsUrl || ws.settings.privacyUrl) && !input.acceptTerms) {
    return req.respond(
      { error: "Please accept the terms first." },
      { status: 400 },
    );
  }
  if (
    !req.voter.emailVerifiedAt &&
    !(await verifyTurnstile(input.turnstileToken, req.ip))
  ) {
    return req.respond(
      { error: "Couldn't verify you're human. Try again." },
      { status: 403 },
    );
  }

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
    return req.respond(
      { error: "Too many ideas from here. Try again later." },
      { status: 429 },
    );
  }

  try {
    const source = req.embed ? "embed" : "public";
    const item = await submitIdea(db, req.ctx, {
      workspaceId: ws.id,
      board: input.board,
      title: input.title,
      details: input.details,
      trackedUserId: req.voter.id,
      source,
    });
    await trackEvent(db, req.ctx, {
      workspaceId: ws.id,
      type: "feedback_submit",
      subjectId: item.id,
      visitorId: req.visitorId,
      ...req.location,
      source,
    });
    if (item.review === "approved") invalidatePublic(ws.id);
    return req.respond({
      id: item.id,
      slug: item.slug,
      title: item.title,
      boardId: item.boardId,
      pending: item.review === "pending",
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return req.respond({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
