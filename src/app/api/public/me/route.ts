import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { notFound, publicRequest } from "@/server/public-request";
import { votedCardIds } from "@/server/services/votes";

/**
 * The caller's voter state for one workspace: who they are (if signed in)
 * and which cards they voted for. Read by the public pages after load, so
 * the pages themselves stay cacheable.
 */
export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const workspaceId = z
    .uuid()
    .safeParse(request.nextUrl.searchParams.get("workspace"));
  if (!workspaceId.success) {
    return req.respond({ error: "Invalid request." }, { status: 400 });
  }
  const voted = await votedCardIds(
    db,
    req.ctx,
    req.voter ? { trackedUserId: req.voter.id } : { visitorId: req.visitorId },
    workspaceId.data,
  );
  return req.respond({
    voter: req.voter
      ? {
          name: req.voter.name,
          email: req.voter.email,
          verified: !!req.voter.emailVerifiedAt,
        }
      : null,
    voted,
    visitor: req.visitorToken,
  });
}
