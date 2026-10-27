import "server-only";
import type { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import type { TrackedUser } from "@/server/db/schema";
import { type PublicRequest, setVoterSession } from "@/server/public-request";
import { createTrackedSession } from "@/server/services/tracked-users";
import { claimVisitorVotes } from "@/server/services/votes";

/**
 * After a voter signs in: start their session and move this visitor's
 * anonymous votes onto them (duplicates dropped).
 */
export async function completeSignIn(
  req: PublicRequest,
  user: TrackedUser,
  response: NextResponse,
) {
  await claimVisitorVotes(db, req.ctx, req.visitorId, user.id);
  const session = await createTrackedSession(db, req.ctx, user.id);
  setVoterSession(response, session.token, session.expiresAt, req.embed);
  return response;
}

export function voterJson(user: TrackedUser) {
  return {
    voter: {
      name: user.name,
      email: user.email,
      verified: !!user.emailVerifiedAt,
    },
  };
}
