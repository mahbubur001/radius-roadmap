import type { NextRequest } from "next/server";
import { guestSignInSchema } from "@/lib/schemas/voting";
import { db } from "@/server/db/client";
import { notFound, publicRequest } from "@/server/public-request";
import { ConflictError } from "@/server/services/context";
import { guestSignIn } from "@/server/services/voter-auth";
import { verifyTurnstile } from "@/server/turnstile";
import { completeSignIn, voterJson } from "@/server/voter-session";

/** "Continue as guest": name + email, not verified. */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = guestSignInSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return req.respond(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  if (!(await verifyTurnstile(parsed.data.turnstileToken, req.ip))) {
    return req.respond(
      { error: "Couldn't verify you're human. Try again." },
      { status: 403 },
    );
  }
  try {
    const user = await guestSignIn(db, req.ctx, parsed.data);
    return completeSignIn(req, user, req.respond(voterJson(user)));
  } catch (error) {
    if (error instanceof ConflictError) {
      return req.respond({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
