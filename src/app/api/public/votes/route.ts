import type { NextRequest } from "next/server";
import { voteSchema } from "@/lib/schemas/voting";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import { notFound, publicRequest } from "@/server/public-request";
import { hit, VOTE_LIMITS } from "@/server/rate-limit";
import { trackEvent } from "@/server/services/events";
import { getVotableCard } from "@/server/services/public-site";
import { toggleVote } from "@/server/services/votes";
import { verifyTurnstile } from "@/server/turnstile";

/**
 * Toggle the caller's vote on a public card (doc 19 §4.3). A route handler
 * rather than a server action so the embed and (later) the widget can call it.
 */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();

  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return req.respond({ error: "Invalid request." }, { status: 400 });
  }

  const card = await getVotableCard(db, req.ctx, parsed.data.cardId);
  if (!card) return req.respond({ error: "Card not found." }, { status: 404 });

  if (card.requireVoterLogin && !req.voter) {
    return req.respond(
      { error: "Sign in to vote.", signIn: true },
      { status: 401 },
    );
  }

  // Turnstile for anonymous and unverified (guest) voters only.
  const verified = !!req.voter?.emailVerifiedAt;
  if (
    !verified &&
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
      key: `vote:ip:${ipKey}`,
      max: VOTE_LIMITS.perIpHour,
      windowSeconds: 3600,
    },
    ...(req.voter
      ? []
      : [
          {
            key: `vote:anon:${card.id}:${ipKey}`,
            max: VOTE_LIMITS.anonymousPerCardIpDay,
            windowSeconds: 86_400,
          },
        ]),
  ]);
  if (!allowed) {
    return req.respond(
      { error: "Too many votes. Try again later." },
      { status: 429 },
    );
  }

  const source = req.embed ? "embed" : "public";
  const result = await toggleVote(
    db,
    req.ctx,
    card,
    req.voter ? { trackedUserId: req.voter.id } : { visitorId: req.visitorId },
    { ipHash: req.ipHash, ...req.location, source },
  );
  await trackEvent(db, req.ctx, {
    workspaceId: card.workspaceId,
    type: result.voted ? "vote" : "unvote",
    subjectId: card.id,
    visitorId: req.visitorId,
    ...req.location,
    source,
  });
  invalidatePublic(card.workspaceId);

  return req.respond({ ...result, visitor: req.visitorToken });
}
