import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { resolveSite } from "@/server/services/public-site";

// Caddy's on-demand TLS `ask` endpoint: 200 issues a certificate, anything
// else refuses. Approves <account-slug>.<PUBLIC_ROOT_DOMAIN> when that account
// exists. Custom domains ship in Phase 6; until then they are refused.
export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  if (!domain) return new Response("missing domain", { status: 400 });
  const site = await resolveSite(db, domain, env.PUBLIC_ROOT_DOMAIN);
  return site
    ? new Response("ok")
    : new Response("unknown domain", { status: 404 });
}
