import { type NextRequest, NextResponse } from "next/server";
import { LAST_WORKSPACE_COOKIE, RESERVED_SLUGS } from "@/lib/schemas/workspace";
import { db } from "@/server/db/client";
import { publicPathStatus, resolveSite } from "@/server/services/public-site";
import {
  newVisitorToken,
  VISITOR_COOKIE,
  verifyVisitorToken,
  visitorCookieOptions,
} from "@/server/visitor";

const secure =
  new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    .protocol === "https:";

/**
 * Path → tenant routing (doc 19, D1 revised).
 * - `/`, `/dashboard/<workspace>/…` and the app's own routes (sign-in, …,
 *   all in RESERVED_SLUGS): the dashboard. Never framed.
 * - Any other first segment is an account slug: its public site, rewritten
 *   to /sites/<account>/<rest>. Direct requests to /sites/… are 404s.
 *
 * Public pages stream (Cache Components), which fixes their status at 200
 * before they render. So the proxy checks that the path exists first: a
 * missing page gets a real 404, and `/<account>` and `/<account>/<workspace>`
 * real redirects.
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean).map(decodeSegment);
  const [first, ...rest] = segments;

  if (first === "sites") return notFoundPage();
  if (!first || RESERVED_SLUGS.has(first) || first.includes(".")) {
    return dashboard(first === "dashboard" ? rest[0] : undefined);
  }

  const site = await resolveSite(db, first);
  const status = site
    ? await publicPathStatus(
        db,
        { accountId: site.accountId },
        rest,
        searchParams.get("board") ?? undefined,
      )
    : "missing";
  if (status === "missing") return notFoundPage(site?.slug);
  if (status !== "ok") {
    const target = request.nextUrl.clone();
    target.pathname = `/${first}${status.redirect}`;
    return NextResponse.redirect(target, 308);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${pathname.slice(1)}`;
  const response = NextResponse.rewrite(url);

  // Give every public visitor a signed anonymous id (dedupes votes, counts
  // views). Embeds are third-party, so their cookie is partitioned.
  const current = request.cookies.get(VISITOR_COOKIE)?.value;
  if (!(await verifyVisitorToken(current))) {
    const embed = searchParams.get("embed") === "1";
    response.cookies.set(
      VISITOR_COOKIE,
      await newVisitorToken(),
      visitorCookieOptions(embed, secure),
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
function notFoundPage(account?: string) {
  const home = account
    ? `<p><a href="/${account}">Go to the roadmap</a></p>`
    : "";
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;color:#18181b;background:#fff}@media(prefers-color-scheme:dark){body{color:#fafafa;background:#09090b}a{color:#a1a1aa}}main{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}a{color:#52525b}</style></head><body><main><h1>Page not found</h1><p>This page doesn't exist or isn't public.</p>${home}</main></body></html>`,
    {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

/**
 * Dashboard and app routes: never framed. Under /dashboard/<workspace>, also
 * remember the workspace so `/` can return to it. Only a hint: the home page
 * re-checks access before redirecting.
 */
function dashboard(workspace: string | undefined) {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  response.headers.set("X-Frame-Options", "DENY");
  if (workspace && /^[a-z0-9-]+$/.test(workspace)) {
    response.cookies.set(LAST_WORKSPACE_COOKIE, workspace, {
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
