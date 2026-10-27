import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { LAST_WORKSPACE_COOKIE, RESERVED_SLUGS } from "@/lib/schemas/workspace";
import { db } from "@/server/db/client";
import { publicPathStatus, resolveSite } from "@/server/services/public-site";
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
 *
 * Public pages stream (Cache Components), which fixes their status at 200
 * before they render. So the proxy checks that the path exists first: a
 * missing page gets a real 404, and `/` and `/<workspace>` real redirects.
 */
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!host || host === appHost) return rememberWorkspace(request);

  const { pathname, searchParams } = request.nextUrl;
  if (!pathname.startsWith("/_next/")) {
    const site = await resolveSite(db, host, env.PUBLIC_ROOT_DOMAIN);
    const status = site
      ? await publicPathStatus(
          db,
          { accountId: site.accountId },
          pathname.split("/").filter(Boolean).map(decodeSegment),
          searchParams.get("board") ?? undefined,
        )
      : "missing";
    if (status === "missing") return notFoundPage();
    if (status !== "ok") {
      const target = request.nextUrl.clone();
      target.pathname = status.redirect;
      return NextResponse.redirect(target, 308);
    }
  }

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

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Plain 404 for public sites (rendered here, so the status is real). */
function notFoundPage() {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;color:#18181b;background:#fff}@media(prefers-color-scheme:dark){body{color:#fafafa;background:#09090b}a{color:#a1a1aa}}main{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}a{color:#52525b}</style></head><body><main><h1>Page not found</h1><p>This page doesn't exist or isn't public.</p><p><a href="/">Go to the roadmap</a></p></main></body></html>`,
    {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
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
