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

export const VOTER_SESSION_COOKIE = "rr_vs";

const secure = new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:";

/**
 * Everything a public API route needs about the caller: the account (from
 * the Host header, never the body), the anonymous visitor, the signed-in
 * voter (if any) and coarse request metadata. `respond` sets a new visitor
 * cookie when one had to be issued.
 */
export async function publicRequest(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const site = await resolveSite(db, host, env.PUBLIC_ROOT_DOMAIN);
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

  const sessionToken = request.cookies.get(VOTER_SESSION_COOKIE)?.value;
  const voter = sessionToken
    ? await getTrackedSession(db, ctx, sessionToken)
    : null;

  const ip = clientIp(request.headers);
  return {
    site: site as PublicSite,
    ctx,
    embed,
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
  token: string,
  expiresAt: Date,
  embed: boolean,
) {
  response.cookies.set(VOTER_SESSION_COOKIE, token, {
    ...visitorCookieOptions(embed, secure),
    expires: expiresAt,
    maxAge: undefined,
  });
}

export function clearVoterSession(response: NextResponse, embed: boolean) {
  response.cookies.set(VOTER_SESSION_COOKIE, "", {
    ...visitorCookieOptions(embed, secure),
    maxAge: 0,
  });
}

export function notFound() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

/** The public site's origin as the visitor sees it (Host header + app scheme). */
export function siteOrigin(request: NextRequest) {
  return `${secure ? "https:" : "http:"}//${request.headers.get("host")}`;
}
