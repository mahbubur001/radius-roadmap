import type { NextRequest } from "next/server";
import { verifyCodeSchema } from "@/lib/schemas/voting";
import { db } from "@/server/db/client";
import { notFound, publicRequest } from "@/server/public-request";
import { ForbiddenError } from "@/server/services/context";
import { verifyEmailCode } from "@/server/services/voter-auth";
import { completeSignIn, voterJson } from "@/server/voter-session";

/** Signs a voter in with the 6-digit code from their email. */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = verifyCodeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return req.respond(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  try {
    const user = await verifyEmailCode(
      db,
      req.ctx,
      parsed.data.email,
      parsed.data.code,
    );
    return completeSignIn(req, user, req.respond(voterJson(user)));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return req.respond({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
