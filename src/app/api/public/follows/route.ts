import type { NextRequest } from "next/server";
import { followSchema } from "@/lib/schemas/comments";
import { db } from "@/server/db/client";
import { notFound, publicRequest } from "@/server/public-request";
import { setIdeaFollow } from "@/server/services/comments";
import { getVotableIdea } from "@/server/services/public-ideas";
import { getPublicWorkspaceById } from "@/server/services/public-site";

/** Follow or unfollow a public idea (doc 20 D3). Logged-in voters only. */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = followSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return req.respond({ error: "Invalid request." }, { status: 400 });
  }
  const idea = await getVotableIdea(db, req.ctx, parsed.data.feedbackId);
  if (!idea) return notFound();
  const ws = await getPublicWorkspaceById(db, req.ctx, idea.workspaceId);
  if (!ws?.settings.followsEnabled) return notFound();
  if (!req.voter) {
    return req.respond(
      { error: "Log in to follow ideas.", signIn: true },
      { status: 401 },
    );
  }
  await setIdeaFollow(db, req.ctx, idea.id, req.voter.id, parsed.data.follow);
  return req.respond({ following: parsed.data.follow });
}
