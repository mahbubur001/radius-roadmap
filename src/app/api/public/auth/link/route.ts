import { type NextRequest, NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { db } from "@/server/db/client";
import { notFound, publicRequest, siteOrigin } from "@/server/public-request";
import { ForbiddenError } from "@/server/services/context";
import { verifyEmailLink } from "@/server/services/voter-auth";
import { completeSignIn } from "@/server/voter-session";

/** One-click sign-in link from the voter code email. */
export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const next = safeNext(request.nextUrl.searchParams.get("next"), "/");
  const target = new URL(next, siteOrigin(request));
  try {
    const user = await verifyEmailLink(
      db,
      req.ctx,
      request.nextUrl.searchParams.get("token") ?? "",
    );
    return completeSignIn(req, user, NextResponse.redirect(target));
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    target.searchParams.set("signin", "expired");
    return NextResponse.redirect(target);
  }
}
