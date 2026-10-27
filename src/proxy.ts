import { type NextRequest, NextResponse } from "next/server";
import { LAST_WORKSPACE_COOKIE, RESERVED_SLUGS } from "@/lib/schemas/workspace";
import {
  newVisitorToken,
  VISITOR_COOKIE,
  verifyVisitorToken,
  visitorCookieOptions,
} from "@/server/visitor";

const appUrl = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
);
const appHost = appUrl.host;

/**
 * Hostname → tenant routing.
 * - App host (e.g. app.example.com, localhost:3000): the dashboard.
 * - Anything else is a public site: `<account>.<PUBLIC_ROOT_DOMAIN>` (doc 19
 *   D1) or, from Phase 6, a custom domain. It is rewritten to
 *   /sites/<host>/<path>, where the page resolves the host to an account.
 */
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!host || host === appHost) return rememberWorkspace(request);

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${host}${url.pathname}`;
  const response = NextResponse.rewrite(url);

  // Give every public visitor a signed anonymous id (dedupes votes, counts
  // views). Embeds are third-party, so their cookie is partitioned.
  const current = request.cookies.get(VISITOR_COOKIE)?.value;
  if (!(await verifyVisitorToken(current))) {
    const embed = request.nextUrl.searchParams.get("embed") === "1";
    response.cookies.set(
      VISITOR_COOKIE,
      await newVisitorToken(),
      visitorCookieOptions(embed, appUrl.protocol === "https:"),
    );
  }
  return response;
}

/**
 * Remember the last workspace opened so `/` can return to it. Only a hint:
 * the home page re-checks access before redirecting.
 */
function rememberWorkspace(request: NextRequest) {
  const response = NextResponse.next();
  // The dashboard is never framed; only public sites can be embedded.
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  response.headers.set("X-Frame-Options", "DENY");
  const [first] = request.nextUrl.pathname.split("/").filter(Boolean);
  if (first && !RESERVED_SLUGS.has(first) && /^[a-z0-9-]+$/.test(first)) {
    response.cookies.set(LAST_WORKSPACE_COOKIE, first, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|widget.js|embed.js).*)",
  ],
};
