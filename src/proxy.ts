import { type NextRequest, NextResponse } from "next/server";
import { isSiteModule, shortenPath } from "@/lib/public-path";
import { LAST_WORKSPACE_COOKIE, RESERVED_SLUGS } from "@/lib/schemas/workspace";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { isPlatformAdmin } from "@/server/platform-admins";
import {
  activeHostname,
  hostOrigin,
  inactiveDomainSite,
  siteForHost,
} from "@/server/services/custom-domains";
import {
  isSuspendedSlug,
  publicPathStatus,
  resolveSite,
} from "@/server/services/public-site";
import {
  newVisitorToken,
  VISITOR_COOKIE,
  verifyVisitorToken,
  visitorCookieOptions,
} from "@/server/visitor";

const appUrl = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
);
const secure = appUrl.protocol === "https:";

/** Tells public pages how their links start: "" on a custom domain. */
const PREFIX_HEADER = "x-rr-site-prefix";

/**
 * Host + path → tenant routing.
 *
 * On the app domain (doc 19, D1 revised):
 * - `/`, `/dashboard/<workspace>/…` and the app's own routes (sign-in, …,
 *   all in RESERVED_SLUGS): the dashboard. Never framed.
 * - Any other first segment is an account slug: its public site, rewritten
 *   to /sites/<account>/<rest>. Direct requests to /sites/… are 404s. If the
 *   account has a live custom domain, the page 308s there (doc 26 D5).
 *
 * On a customer's own domain (doc 26 6D): the whole path is the account's
 * public site (`/roadmap`, `/<workspace>/roadmap`); nothing of the app is
 * served there (D7).
 *
 * Public pages stream (Cache Components), which fixes their status at 200
 * before they render. So the proxy checks that the path exists first: a
 * missing page gets a real 404, and site roots real redirects.
 *
 * The account's default workspace has short URLs: /<account>/roadmap is
 * /<account>/<default-workspace>/roadmap (doc 26 §11).
 */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/_next/"))
    return NextResponse.next();
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (hostname(host) !== appUrl.hostname) return customHost(request, host);

  const { pathname } = request.nextUrl;
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  const segments = pathname.split("/").filter(Boolean).map(decodeSegment);
  const [first, ...rest] = segments;

  if (first === "sites") return notFoundPage();
  // Platform admin panel (doc 28 C2): a real 404 for everyone else, before
  // anything renders (a streamed page can't change its status).
  if (first === "admin") {
    const session = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);
    if (
      !session ||
      !isPlatformAdmin(session.user.email, session.user.emailVerified)
    ) {
      return notFoundPage();
    }
  }
  if (!first || RESERVED_SLUGS.has(first) || first.includes(".")) {
    return dashboard(first === "dashboard" ? rest[0] : undefined);
  }

  const site = await resolveSite(db, first);
  if (!site) {
    // Suspended by a platform admin (doc 28 C8): say so, don't pretend 404.
    return (await isSuspendedSlug(db, first))
      ? unavailablePage()
      : notFoundPage();
  }
  const [rawFirst = "", ...rawRest] = pathname.split("/").filter(Boolean);

  // A live custom domain is the site's only address (D5); embeds stay here.
  if (request.nextUrl.searchParams.get("embed") !== "1") {
    const domain = await cached(`domain:${site.accountId}`, () =>
      activeHostname(db, site.accountId),
    );
    if (domain) {
      const target = new URL(
        `${rawRest.length ? `/${rawRest.join("/")}` : "/"}${request.nextUrl.search}`,
        hostOrigin(domain),
      );
      return domainRedirect(target);
    }
  }

  return publicSite(
    request,
    site,
    rest,
    rawRest,
    `/${rawFirst}`,
    appUrl.origin,
  );
}

/** A request on a customer's own domain (doc 26 6D). */
async function customHost(request: NextRequest, host: string) {
  const { pathname } = request.nextUrl;
  const name = hostname(host);

  // Caddy's certificate check (D3) must answer on any host it asks with.
  if (pathname === "/api/domain-check") return NextResponse.next();

  const site = await cached(`host:${name}`, () => siteForHost(db, name));
  if (!site) {
    // A domain that was live but is switched off (downgrade, DNS gone):
    // send visitors to the app-domain address (D6).
    const old = await cached(`old:${name}`, () => inactiveDomainSite(db, name));
    if (!old) return notFoundPage();
    const target = new URL(
      `/${old.slug}${pathname === "/" ? "" : pathname}${request.nextUrl.search}`,
      appUrl.origin,
    );
    return domainRedirect(target);
  }

  // Only the public site, its API and files (D7). No app pages, no auth,
  // no server actions.
  if (pathname.startsWith("/api/")) {
    return pathname.startsWith("/api/public/") ||
      pathname.startsWith("/api/files/")
      ? NextResponse.next()
      : NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (request.headers.has("next-action")) return notFoundPage();
  if (pathname === "/robots.txt") {
    return new NextResponse(
      `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${hostOrigin(name)}/sitemap.xml\n`,
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const segments = pathname.split("/").filter(Boolean).map(decodeSegment);
  const raw = pathname.split("/").filter(Boolean);
  if (segments[0] === "sites") return notFoundPage();
  const resolved = await resolveSite(db, site.slug);
  if (!resolved) return notFoundPage();
  return publicSite(request, resolved, segments, raw, "", hostOrigin(name));
}

/**
 * The account's public site for `rest` (path after the account, or the whole
 * path on a custom domain). `prefix` is what links start with; `origin` is
 * where redirects go (request.nextUrl has the server's host, not the
 * visitor's).
 */
async function publicSite(
  request: NextRequest,
  site: NonNullable<Awaited<ReturnType<typeof resolveSite>>>,
  rest: string[],
  rawRest: string[],
  prefix: string,
  origin: string,
) {
  const redirect = (path: string) =>
    NextResponse.redirect(
      new URL(`${path || "/"}${request.nextUrl.search}`, origin),
      308,
    );
  const { searchParams } = request.nextUrl;
  const home = site.defaultWorkspace;

  // The default workspace lives at /<module> (doc 26 §11); its long
  // /<workspace>/<module> URLs move there.
  if (home && rest[0] === home && isSiteModule(rest[1])) {
    return redirect(`${prefix}/${rawRest.slice(1).join("/")}`);
  }
  const short = !!home && isSiteModule(rest[0]);
  const sitePath = short && home ? [home, ...rest] : rest;

  const status = await publicPathStatus(
    db,
    { accountId: site.accountId },
    sitePath,
    searchParams.get("board") ?? undefined,
  );
  if (status === "missing") return notFoundPage(prefix || "/");
  if (status !== "ok") {
    return redirect(`${prefix}${shortenPath(status.redirect, home)}`);
  }

  const url = request.nextUrl.clone();
  const account = encodeURIComponent(site.slug);
  url.pathname = short
    ? `/sites/${account}/${encodeURIComponent(home ?? "")}/${rawRest.join("/")}`
    : `/sites/${account}${rawRest.length ? `/${rawRest.join("/")}` : ""}`;
  // Always set here, so a visitor can't send their own.
  const headers = new Headers(request.headers);
  headers.set(PREFIX_HEADER, prefix);
  const response = NextResponse.rewrite(url, { request: { headers } });

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

/**
 * 308 between the app domain and a custom domain. Browsers keep permanent
 * redirects forever unless told otherwise, and a domain can be removed or
 * switched off again (D6): an hour is enough.
 */
function domainRedirect(target: URL) {
  const response = NextResponse.redirect(target, 308);
  response.headers.set("Cache-Control", "public, max-age=3600");
  return response;
}

/** "feedback.acme.com:443" → "feedback.acme.com". */
function hostname(host: string) {
  return host.replace(/:\d+$/, "");
}

// Custom domain lookups run on every public request: in production they're
// kept for a minute (each web process has its own copy), so domain changes
// show up within that time. Not cached in development and e2e.
const TTL_MS = process.env.NODE_ENV === "production" ? 60_000 : 0;
const cache = new Map<string, { value: unknown; expires: number }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = await load();
  if (cache.size > 5000) cache.clear();
  cache.set(key, { value, expires: now + TTL_MS });
  return value;
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Plain 404 for public sites (rendered here, so the status is real). */
function notFoundPage(home?: string) {
  const link = home ? `<p><a href="${home}">Go to the roadmap</a></p>` : "";
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;color:#18181b;background:#fff}@media(prefers-color-scheme:dark){body{color:#fafafa;background:#09090b}a{color:#a1a1aa}}main{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}a{color:#52525b}</style></head><body><main><h1>Page not found</h1><p>This page doesn't exist or isn't public.</p>${link}</main></body></html>`,
    {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

/** A suspended account's public site (doc 28 C8). */
function unavailablePage() {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Site unavailable</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;color:#18181b;background:#fff}@media(prefers-color-scheme:dark){body{color:#fafafa;background:#09090b}}main{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}</style></head><body><main><h1>This site is unavailable</h1><p>It has been switched off for now.</p></main></body></html>`,
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "86400",
      },
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|widget.js|embed.js).*)"],
};
