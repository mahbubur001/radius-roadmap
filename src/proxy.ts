import { type NextRequest, NextResponse } from "next/server";

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
  if (!host || host === appHost) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${host}${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|widget.js).*)"],
};
