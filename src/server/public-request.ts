import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import type { PublicContext } from "@/server/services/context";
import { type PublicSite, resolveSite } from "@/server/services/public-site";
import { getTrackedSession } from "@/server/services/tracked-users";
import {
  clientIp,
  clientLocation,
  hashIp,
  newVisitorToken,
  VISITOR_COOKIE,
  VISITOR_HEADER,
  verifyVisitorToken,
  visitorCookieOptions,
} from "@/server/visitor";

/** Site header sent by the public pages and the embed (the account slug). */
export const SITE_HEADER = "x-rr-site";

/**
 * Voter sessions are per account: every public site shares the app domain
 * (doc 19, D1 revised), so the cookie name carries the account id.
 */
export function voterSessionCookie(accountId: string) {
  return `rr_vs_${accountId}`;
}

const secure = new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:";

/**
 * Everything a public API route needs about the caller: the account (from
 * the site slug in `x-rr-site`, or `?site=` on links from emails; never an
 * account id), the anonymous visitor, the signed-in voter (if any) and coarse
 * request metadata. `respond` sets a new visitor cookie when one had to be
 * issued.
 */
export async function publicRequest(request: NextRequest) {
  const slug =
    request.headers.get(SITE_HEADER) ??
    request.nextUrl.searchParams.get("site") ??
    "";
  const site = await resolveSite(db, slug);
  if (!site) return null;
  const ctx: PublicContext = { accountId: site.accountId };
  const embed = request.headers.get("x-rr-embed") === "1";

  // Cookie first; embeds whose cookies are blocked send the token in a header.
  const presented =
    request.cookies.get(VISITOR_COOKIE)?.value ??
    request.headers.get(VISITOR_HEADER);
  let visitorToken = presented ?? null;
  let visitorId = await verifyVisitorToken(presented);
  let issued = false;
  if (!visitorId) {
    visitorToken = await newVisitorToken();
    visitorId = await verifyVisitorToken(visitorToken);
    issued = true;
  }

  const sessionCookie = voterSessionCookie(site.accountId);
  const sessionToken = request.cookies.get(sessionCookie)?.value;
  const voter = sessionToken
    ? await getTrackedSession(db, ctx, sessionToken)
    : null;

  const ip = clientIp(request.headers);
  return {
    site: site as PublicSite,
    ctx,
    embed,
    sessionCookie,
    sessionToken,
    visitorId: visitorId as string,
    visitorToken: visitorToken as string,
    voter,
    ip,
    ipHash: await hashIp(ip),
    location: clientLocation(request.headers),
    /** JSON response that also stores a newly issued visitor id. */
    respond(body: unknown, init?: ResponseInit) {
      const response = NextResponse.json(body, init);
      if (issued) {
        response.cookies.set(
          VISITOR_COOKIE,
          visitorToken as string,
          visitorCookieOptions(embed, secure),
        );
      }
      return response;
    },
  };
}

export type PublicRequest = NonNullable<
  Awaited<ReturnType<typeof publicRequest>>
>;

export function setVoterSession(
  response: NextResponse,
  req: PublicRequest,
  token: string,
  expiresAt: Date,
) {
  response.cookies.set(req.sessionCookie, token, {
    ...visitorCookieOptions(req.embed, secure),
    expires: expiresAt,
    maxAge: undefined,
  });
}

export function clearVoterSession(response: NextResponse, req: PublicRequest) {
  response.cookies.set(req.sessionCookie, "", {
    ...visitorCookieOptions(req.embed, secure),
    maxAge: 0,
  });
}

export function notFound() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

/** The app origin as the visitor sees it (Host header + app scheme; Caddy proxies). */
export function siteOrigin(request: NextRequest) {
  return `${secure ? "https:" : "http:"}//${request.headers.get("host")}`;
}
