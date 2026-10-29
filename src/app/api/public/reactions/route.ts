import type { NextRequest } from "next/server";
import { z } from "zod";
import { REACTIONS, type ReactionKey } from "@/lib/reactions";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import { notFound, publicRequest } from "@/server/public-request";
import { hit } from "@/server/rate-limit";
import { trackEvent } from "@/server/services/events";
import { getReactablePost } from "@/server/services/public-updates";
import { toggleReaction } from "@/server/services/reactions";

const schema = z.object({
  updateId: z.uuid(),
  emoji: z.enum(REACTIONS.map((r) => r.key) as [ReactionKey, ...ReactionKey[]]),
});

/** Toggle an emoji reaction on a public post (doc 23 U4). */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return req.respond({ error: "Invalid request." }, { status: 400 });
  }
  const post = await getReactablePost(db, req.ctx, parsed.data.updateId);
  if (!post) return notFound();
  const allowed = await hit([
    {
      key: `reaction:ip:${req.ipHash ?? req.visitorId}`,
      max: 60,
      windowSeconds: 3600,
    },
  ]);
  if (!allowed) {
    return req.respond(
      { error: "Too many reactions. Try again later." },
      { status: 429 },
    );
  }
  const result = await toggleReaction(
    db,
    req.ctx,
    post.id,
    parsed.data.emoji,
    req.voter ? { trackedUserId: req.voter.id } : { visitorId: req.visitorId },
  );
  if (result.reacted) {
    await trackEvent(db, req.ctx, {
      workspaceId: post.workspaceId,
      type: "reaction",
      subjectId: post.id,
      visitorId: req.visitorId,
      ...req.location,
      source: req.embed ? "embed" : "public",
    });
  }
  invalidatePublic(post.workspaceId);
  return req.respond({ ...result, visitor: req.visitorToken });
}
