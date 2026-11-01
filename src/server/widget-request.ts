import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { publicRequest } from "@/server/public-request";
import { widgetIdentity } from "@/server/services/widget";

// The widget runs on customers' sites: every /api/widget route answers any
// origin, without cookies. The visitor id travels in `x-rr-visitor` and an
// identity token from the customer's app in `x-rr-token` (doc 26 6B).

export const TOKEN_HEADER = "x-rr-token";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "content-type, x-rr-site, x-rr-visitor, x-rr-token",
  "access-control-max-age": "86400",
};

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function cors<T extends Response>(response: T) {
  for (const [k, v] of Object.entries(CORS)) response.headers.set(k, v);
  return response;
}

export function widgetError(error: string, status: number) {
  return cors(NextResponse.json({ error }, { status }));
}

/** publicRequest + who the widget user is (token, else name/email). */
export async function widgetRequest(
  request: NextRequest,
  guest?: { name?: string | null; email?: string | null },
) {
  const req = await publicRequest(request);
  if (!req) return null;
  const identity = await widgetIdentity(db, req.ctx, {
    token: request.headers.get(TOKEN_HEADER),
    ...guest,
  });
  return {
    ...req,
    identity,
    /** Votes and reactions count per person when known, else per visitor. */
    voter: identity
      ? { trackedUserId: identity.user.id, visitorId: req.visitorId }
      : { visitorId: req.visitorId },
    respond(body: unknown, init?: ResponseInit) {
      return cors(NextResponse.json(body, init));
    },
  };
}
