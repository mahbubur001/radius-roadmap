import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { env } from "@/lib/env";
import { planIncludes } from "@/lib/plans";
import { type DomainInput, domainSchema } from "@/lib/schemas/domain";
import type { Db } from "@/server/db/client";
import {
  customDomains,
  member,
  organization,
  user,
  workspaces,
} from "@/server/db/schema";
import {
  type AccountContext,
  assertRole,
  ConflictError,
  isUniqueViolation,
} from "./context";
import { assertFeature, getAccountPlan } from "./plan-limits";

// Customer-owned domains for public sites (doc 26 6D). Runs in the worker
// too (verification job, email links): no server-only imports.

/** Prefix of the ownership TXT record (D2). */
export const TXT_PREFIX = "_radius-roadmap";
const TXT_VALUE = "radius-roadmap-verify=";

/** Pending domains give up after 48 h; active ones after 3 failed days (D4). */
const PENDING_FOR_MS = 48 * 3600 * 1000;
const MAX_FAILURES = 3;

const dev = env.NODE_ENV !== "production";

function appUrl() {
  return new URL(env.NEXT_PUBLIC_APP_URL);
}

export const customDomainsConfig = {
  /** What customers CNAME to; null = custom domains off (D9). */
  target: (): string | null =>
    env.CUSTOM_DOMAIN_TARGET?.toLowerCase() ?? (dev ? "localhost" : null),
};

/** Development hosts that verify without DNS (D9). Never in production. */
function isDevHost(host: string) {
  return dev && (host === "localhost" || host.endsWith(".localhost"));
}

/** Our app domain or one of its subdomains (never a custom domain, D1). */
export function isOurDomain(hostname: string, appHost: string) {
  return hostname === appHost || hostname.endsWith(`.${appHost}`);
}

export type DnsResolver = {
  txt(host: string): Promise<string[][]>;
  cname(host: string): Promise<string[]>;
};

function withTimeout<T>(promise: Promise<T>, ms = 5000) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS timeout")), ms),
    ),
  ]);
}

export const systemDns: DnsResolver = {
  txt: (host) => withTimeout(dns.resolveTxt(host)),
  cname: (host) => withTimeout(dns.resolveCname(host)),
};

export async function getDomain(db: Db, ctx: AccountContext) {
  const [row] = await db
    .select()
    .from(customDomains)
    .where(eq(customDomains.accountId, ctx.accountId))
    .limit(1);
  return row ?? null;
}

/** Set (or replace) the account's domain; it starts pending with a new token. */
export async function setDomain(
  db: Db,
  ctx: AccountContext,
  input: DomainInput,
) {
  assertRole(ctx, "admin");
  await assertFeature(db, ctx.accountId, "customDomain");
  if (!customDomainsConfig.target()) {
    throw new ConflictError("Custom domains aren't set up on this server.");
  }
  const { hostname } = domainSchema.parse(input);
  if (!isDevHost(hostname)) {
    if (isOurDomain(hostname, appUrl().hostname)) {
      throw new ConflictError("Use a domain you own, not ours.");
    }
    if (hostname.endsWith("localhost")) {
      throw new ConflictError("Enter a domain you own.");
    }
  }
  const values = {
    hostname,
    status: "pending" as const,
    verifyToken: randomBytes(16).toString("hex"),
    verifiedAt: null,
    lastCheckedAt: null,
    failures: 0,
    error: null,
    createdAt: new Date(),
  };
  const [row] = await db
    .insert(customDomains)
    .values({ accountId: ctx.accountId, ...values })
    .onConflictDoUpdate({ target: customDomains.accountId, set: values })
    .returning();
  if (!row) throw new Error("Domain not saved.");
  return row;
}

/** Remove the account's domain; returns the hostname it had (or null). */
export async function removeDomain(db: Db, ctx: AccountContext) {
  assertRole(ctx, "admin");
  const [row] = await db
    .delete(customDomains)
    .where(eq(customDomains.accountId, ctx.accountId))
    .returning({ hostname: customDomains.hostname });
  return row?.hostname ?? null;
}

/** The two DNS records the customer adds. */
export function dnsRecords(domain: { hostname: string; verifyToken: string }) {
  return {
    cname: {
      name: domain.hostname,
      value: customDomainsConfig.target() ?? "",
    },
    txt: {
      name: `${TXT_PREFIX}.${domain.hostname}`,
      value: `${TXT_VALUE}${domain.verifyToken}`,
    },
  };
}

/** Checks DNS for one domain: null when it's right, else the problem. */
export async function checkDns(
  domain: { hostname: string; verifyToken: string },
  resolver: DnsResolver,
): Promise<string | null> {
  if (isDevHost(domain.hostname)) return null;
  const target = customDomainsConfig.target();
  if (!target) return "Custom domains aren't set up on this server.";
  const records = dnsRecords(domain);
  const txt = await resolver.txt(records.txt.name).catch(() => []);
  if (!txt.some((parts) => parts.join("") === records.txt.value)) {
    return `The TXT record on ${records.txt.name} is missing or wrong.`;
  }
  const cname = await resolver.cname(domain.hostname).catch(() => []);
  const points = cname.some(
    (c) => c.toLowerCase().replace(/\.$/, "") === target,
  );
  return points
    ? null
    : `${domain.hostname} needs a CNAME record pointing to ${target}.`;
}

export type VerifyResult = {
  status: "pending" | "active" | "failed";
  error: string | null;
  /** Set when this check changed whether the domain works (owner email). */
  changed: "active" | "failed" | null;
  /** When this check ran (ISO): makes the owner email's job id unique. */
  checkedAt: string;
};

/**
 * Check one domain and record the outcome (D4). Pending domains turn active
 * or, after 48 h, failed; active ones fail after 3 bad checks in a row.
 */
export async function verifyDomain(
  db: Db,
  domainId: string,
  resolver: DnsResolver = systemDns,
  now = new Date(),
): Promise<VerifyResult | null> {
  const [domain] = await db
    .select()
    .from(customDomains)
    .where(eq(customDomains.id, domainId))
    .limit(1);
  if (!domain) return null;
  const problem = await checkDns(domain, resolver);
  const checkedAt = now.toISOString();
  const set = (values: Partial<typeof customDomains.$inferInsert>) =>
    db
      .update(customDomains)
      .set({ lastCheckedAt: now, ...values })
      .where(eq(customDomains.id, domainId));

  if (!problem) {
    try {
      await set({
        status: "active",
        verifiedAt: domain.verifiedAt ?? now,
        failures: 0,
        error: null,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const taken = "Another account already uses this domain.";
      await set({ status: "failed", error: taken });
      return { status: "failed", error: taken, changed: null, checkedAt };
    }
    return {
      status: "active",
      error: null,
      changed: domain.status === "active" ? null : "active",
      checkedAt,
    };
  }

  if (domain.status === "active") {
    const failures = domain.failures + 1;
    const failed = failures >= MAX_FAILURES;
    await set({
      failures,
      error: problem,
      status: failed ? "failed" : "active",
    });
    return {
      status: failed ? "failed" : "active",
      error: problem,
      changed: failed ? "failed" : null,
      checkedAt,
    };
  }
  const expired = now.getTime() - domain.createdAt.getTime() > PENDING_FOR_MS;
  const status = domain.status === "pending" && !expired ? "pending" : "failed";
  await set({ status, error: problem });
  return { status, error: problem, changed: null, checkedAt };
}

/** "Verify now" from Settings: the caller's own domain only. */
export async function verifyOwnDomain(
  db: Db,
  ctx: AccountContext,
  resolver: DnsResolver = systemDns,
) {
  assertRole(ctx, "admin");
  const domain = await getDomain(db, ctx);
  if (!domain) return null;
  return verifyDomain(db, domain.id, resolver);
}

/** Domains the scheduled job checks: pending ones, and active ones daily. */
export async function domainsDue(db: Db, now = new Date()) {
  const dayAgo = new Date(now.getTime() - 20 * 3600 * 1000);
  const rows = await db
    .select({ id: customDomains.id })
    .from(customDomains)
    .where(
      or(
        eq(customDomains.status, "pending"),
        and(
          eq(customDomains.status, "active"),
          or(
            isNull(customDomains.lastCheckedAt),
            lt(customDomains.lastCheckedAt, dayAgo),
          ),
        ),
      ),
    )
    .limit(500);
  return rows.map((r) => r.id);
}

/** Origin of a hostname, with the app's scheme (and port, in development). */
export function hostOrigin(hostname: string) {
  const app = appUrl();
  return `${app.protocol}//${hostname}${app.port ? `:${app.port}` : ""}`;
}

/**
 * The account whose active domain is `host`, if its plan includes custom
 * domains (D6: a downgraded domain is treated as inactive).
 */
export async function siteForHost(db: Db, host: string) {
  const [row] = await db
    .select({
      accountId: customDomains.accountId,
      slug: organization.slug,
      hostname: customDomains.hostname,
    })
    .from(customDomains)
    .innerJoin(organization, eq(organization.id, customDomains.accountId))
    .where(
      and(
        eq(customDomains.hostname, host.toLowerCase()),
        eq(customDomains.status, "active"),
      ),
    )
    .limit(1);
  if (!row) return null;
  const plan = await getAccountPlan(db, row.accountId);
  return planIncludes(plan, "customDomain") ? row : null;
}

/**
 * A domain that was live once but isn't served now (downgraded plan, or DNS
 * checks failed): its account, so the custom host can send visitors back to
 * the app-domain address (D6).
 */
export async function inactiveDomainSite(db: Db, host: string) {
  const [row] = await db
    .select({ accountId: customDomains.accountId, slug: organization.slug })
    .from(customDomains)
    .innerJoin(organization, eq(organization.id, customDomains.accountId))
    .where(
      and(
        eq(customDomains.hostname, host.toLowerCase()),
        isNotNull(customDomains.verifiedAt),
      ),
    )
    .orderBy(desc(customDomains.verifiedAt))
    .limit(1);
  return row ?? null;
}

/** Hostnames of the accounts' active, plan-allowed domains. */
export async function activeHostnames(db: Db, accountIds: string[]) {
  if (!accountIds.length) return new Map<string, string>();
  const rows = await db
    .select({
      accountId: customDomains.accountId,
      hostname: customDomains.hostname,
    })
    .from(customDomains)
    .where(
      and(
        inArray(customDomains.accountId, accountIds),
        eq(customDomains.status, "active"),
      ),
    );
  const out = new Map<string, string>();
  for (const r of rows) {
    if (planIncludes(await getAccountPlan(db, r.accountId), "customDomain")) {
      out.set(r.accountId, r.hostname);
    }
  }
  return out;
}

/** The account's active custom hostname, or null (app domain). */
export async function activeHostname(db: Db, accountId: string) {
  return (await activeHostnames(db, [accountId])).get(accountId) ?? null;
}

/**
 * Where an account's public site lives (D5): its active custom domain, else
 * `<app>/<account-slug>`. No trailing slash; append `/roadmap` etc.
 */
export async function publicSiteBase(
  db: Db,
  accountId: string,
  accountSlug: string,
) {
  const host = await activeHostname(db, accountId);
  return host ? hostOrigin(host) : `${appUrl().origin}/${accountSlug}`;
}

/** Who to tell about a domain going live or failing: the account's owners. */
export async function domainNotice(db: Db, domainId: string) {
  const [row] = await db
    .select({
      accountId: customDomains.accountId,
      hostname: customDomains.hostname,
      accountName: organization.name,
    })
    .from(customDomains)
    .innerJoin(organization, eq(organization.id, customDomains.accountId))
    .where(eq(customDomains.id, domainId))
    .limit(1);
  if (!row) return null;
  const [owners, [first]] = await Promise.all([
    db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.organizationId, row.accountId), eq(member.role, "owner")),
      ),
    db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.accountId, row.accountId))
      .orderBy(asc(workspaces.createdAt))
      .limit(1),
  ]);
  return {
    accountId: row.accountId,
    hostname: row.hostname,
    accountName: row.accountName,
    owners: owners.map((o) => o.email),
    /** Settings → Domain in the account's first workspace. */
    settingsUrl: `${appUrl().origin}${first ? `/dashboard/${first.slug}/settings/domain` : "/"}`,
  };
}
