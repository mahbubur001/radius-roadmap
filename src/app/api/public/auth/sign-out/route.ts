import type { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import {
  clearVoterSession,
  notFound,
  publicRequest,
} from "@/server/public-request";
import { revokeTrackedSession } from "@/server/services/tracked-users";

export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  if (req.sessionToken) {
    await revokeTrackedSession(db, req.ctx, req.sessionToken);
  }
  const response = req.respond({ ok: true });
  clearVoterSession(response, req);
  return response;
}
