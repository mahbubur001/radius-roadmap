import type { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import {
  clearVoterSession,
  notFound,
  publicRequest,
  VOTER_SESSION_COOKIE,
} from "@/server/public-request";
import { revokeTrackedSession } from "@/server/services/tracked-users";

export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const token = request.cookies.get(VOTER_SESSION_COOKIE)?.value;
  if (token) await revokeTrackedSession(db, req.ctx, token);
  const response = req.respond({ ok: true });
  clearVoterSession(response, req.embed);
  return response;
}
