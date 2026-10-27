import { type NextRequest, NextResponse } from "next/server";
import { LAST_WORKSPACE_COOKIE, RESERVED_SLUGS } from "@/lib/schemas/workspace";

const appHost = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
).host;

/**
 * Hostname → tenant routing.
 * - App host (e.g. app.example.com, localhost:3000): normal routing.
 * - Any other host is a customer's custom domain: rewrite to the public site
 *   at /sites/<host>/<path>, where the page resolves the host to a workspace.
 *   (Custom domains ship in Phase 6; this is the skeleton.)
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!host || host === appHost) return rememberWorkspace(request);

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${host}${url.pathname}`;
  return NextResponse.rewrite(url);
}

/**
 * Remember the last workspace opened so `/` can return to it. Only a hint:
 * the home page re-checks access before redirecting.
 */
function rememberWorkspace(request: NextRequest) {
  const response = NextResponse.next();
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|widget.js).*)"],
};
