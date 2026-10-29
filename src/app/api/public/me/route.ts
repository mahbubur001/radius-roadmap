import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { notFound, publicRequest } from "@/server/public-request";
import { myArticleRatings } from "@/server/services/article-ratings";
import { followedIdeaIds } from "@/server/services/comments";
import { pendingIdeas } from "@/server/services/public-ideas";
import { myReactions } from "@/server/services/reactions";
import { votedIds } from "@/server/services/votes";

/**
 * The caller's voter state for one workspace: who they are (if signed in)
 * which cards and ideas they voted for, and their ideas waiting for review. Read by the public pages after load, so
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
  const voter = req.voter
    ? { trackedUserId: req.voter.id }
    : { visitorId: req.visitorId };
  const [voted, pending, following, reactions, ratings] = await Promise.all([
    votedIds(db, req.ctx, voter, workspaceId.data),
    req.voter ? pendingIdeas(db, req.ctx, workspaceId.data, req.voter.id) : [],
    req.voter
      ? followedIdeaIds(db, req.ctx, workspaceId.data, req.voter.id)
      : [],
    myReactions(db, req.ctx, workspaceId.data, voter),
    myArticleRatings(db, req.ctx, workspaceId.data, voter),
  ]);
  return req.respond({
    voter: req.voter
      ? {
          name: req.voter.name,
          email: req.voter.email,
          verified: !!req.voter.emailVerifiedAt,
        }
      : null,
    voted,
    pending,
    following,
    reactions,
    ratings,
    visitor: req.visitorToken,
  });
}
