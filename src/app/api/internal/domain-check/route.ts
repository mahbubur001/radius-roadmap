import type { NextRequest } from "next/server";

// Caddy's on-demand TLS `ask` endpoint: 200 issues a certificate, anything
// else refuses. Custom domains ship in Phase 6; until then refuse them all.
export function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  if (!domain) return new Response("missing domain", { status: 400 });
  return new Response("unknown domain", { status: 404 });
}
