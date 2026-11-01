import type { NextRequest } from "next/server";
import { normalizeHostname } from "@/lib/schemas/domain";
import { db } from "@/server/db/client";
import { hit } from "@/server/rate-limit";
import { siteForHost } from "@/server/services/custom-domains";

/**
 * Caddy asks this before issuing a certificate for a custom domain (doc 26
 * D3): 200 = a live, plan-allowed domain, 404 = no. Public on purpose: it
 * reveals nothing DNS doesn't. Limited per domain, since every ask comes from
 * Caddy's one address.
 */
export async function GET(request: NextRequest) {
  const domain = normalizeHostname(
    request.nextUrl.searchParams.get("domain") ?? "",
  );
  if (!domain || domain.length > 253)
    return new Response(null, { status: 404 });
  const allowed = await hit([
    { key: `domain-check:${domain}`, max: 30, windowSeconds: 60 },
  ]);
  if (!allowed) return new Response(null, { status: 429 });
  const site = await siteForHost(db, domain);
  return new Response(null, { status: site ? 200 : 404 });
}
