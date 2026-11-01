import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { PLANS, type PlanId } from "@/lib/plans";
import type { Db } from "@/server/db/client";
import {
  accountBilling,
  accountSettings,
  apiKeys,
  customDomains,
  invitation,
  member,
  organization,
  planOverrides,
  user,
  webhookEndpoints,
  workspaces,
} from "@/server/db/schema";
import { likePattern } from "@/server/services/cards";
import { NotFoundError } from "../context";
import { publicSiteBase } from "../custom-domains";
import { billing, countUsage, getAccountPlan } from "../plan-limits";
import { listAudit } from "./audit";

// Accounts as the operator sees them (doc 28 C7). Read-only.

const PAID = ["active", "trialing", "past_due"];

/** The plan right now and where it comes from, in SQL (for lists and filters). */
const overrideActive = sql<boolean>`(${planOverrides.plan} is not null and (${planOverrides.endsAt} is null or ${planOverrides.endsAt} > now()))`;
// Constants inlined (not parameters): GROUP BY needs the same expression text.
const stripePaid = sql<boolean>`(${accountBilling.status} in (${sql.raw(
  PAID.map((s) => `'${s}'`).join(", "),
)}))`;
const effectivePlan = sql<PlanId>`case when ${overrideActive} then ${planOverrides.plan}::text when ${stripePaid} then ${accountBilling.plan}::text else 'free' end`;
const planSource = sql<
  "manual" | "stripe" | "free"
>`case when ${overrideActive} then 'manual' when ${stripePaid} then 'stripe' else 'free' end`;

export type AccountStatus = "active" | "suspended" | "awaiting_owner";

export type AccountFilter = {
  q?: string;
  plan?: PlanId;
  status?: AccountStatus;
  page?: number;
};

const PAGE = 50;

export async function listAccounts(db: Db, filter: AccountFilter = {}) {
  const where: SQL[] = [];
  const q = filter.q?.trim();
  if (q) {
    const like = likePattern(q);
    where.push(
      or(
        ilike(organization.name, like),
        ilike(organization.slug, like),
        sql`exists (select 1 from ${member} m join ${user} u on u.id = m.user_id where m.organization_id = ${organization.id} and u.email ilike ${like})`,
        sql`exists (select 1 from ${invitation} i where i.organization_id = ${organization.id} and i.status = 'pending' and i.email ilike ${like})`,
      ) as SQL,
    );
  }
  if (filter.plan) where.push(sql`${effectivePlan} = ${filter.plan}`);
  const members = sql<number>`(select count(*)::int from ${member} m where m.organization_id = ${organization.id})`;
  if (filter.status === "suspended") {
    where.push(isNotNull(accountSettings.suspendedAt));
  } else if (filter.status === "active") {
    where.push(isNull(accountSettings.suspendedAt), sql`${members} > 0`);
  } else if (filter.status === "awaiting_owner") {
    where.push(sql`${members} = 0`);
  }
  const page = Math.max(1, filter.page ?? 1);
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      plan: effectivePlan,
      planSource,
      overrideEndsAt: planOverrides.endsAt,
      suspendedAt: accountSettings.suspendedAt,
      members,
      workspaces: sql<number>`(select count(*)::int from ${workspaces} w where w.account_id = ${organization.id})`,
      owner: sql<
        string | null
      >`(select u.email from ${member} m join ${user} u on u.id = m.user_id where m.organization_id = ${organization.id} and m.role = 'owner' order by m.created_at limit 1)`,
      pendingOwner: sql<
        string | null
      >`(select i.email from ${invitation} i where i.organization_id = ${organization.id} and i.status = 'pending' and i.role = 'owner' order by i.expires_at desc limit 1)`,
    })
    .from(organization)
    .leftJoin(accountBilling, eq(accountBilling.accountId, organization.id))
    .leftJoin(planOverrides, eq(planOverrides.accountId, organization.id))
    .leftJoin(accountSettings, eq(accountSettings.accountId, organization.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(organization.createdAt), asc(organization.id))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  return {
    accounts: rows.slice(0, PAGE),
    page,
    hasMore: rows.length > PAGE,
    /** Without Stripe every account is unlimited; the stored plan is shown. */
    billingOn: billing.enabled(),
  };
}

export async function platformStats(db: Db) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const inWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const [byPlan, [created], [suspended], [ending]] = await Promise.all([
    db
      .select({ plan: effectivePlan, n: count() })
      .from(organization)
      .leftJoin(accountBilling, eq(accountBilling.accountId, organization.id))
      .leftJoin(planOverrides, eq(planOverrides.accountId, organization.id))
      .groupBy(effectivePlan),
    db
      .select({ n: count() })
      .from(organization)
      .where(gt(organization.createdAt, weekAgo)),
    db
      .select({ n: count() })
      .from(accountSettings)
      .where(isNotNull(accountSettings.suspendedAt)),
    db
      .select({ n: count() })
      .from(planOverrides)
      .where(
        and(
          isNotNull(planOverrides.endsAt),
          gt(planOverrides.endsAt, new Date()),
          lte(planOverrides.endsAt, inWeek),
        ),
      ),
  ]);
  const plans = Object.fromEntries(byPlan.map((r) => [r.plan, r.n])) as Partial<
    Record<PlanId, number>
  >;
  return {
    total: byPlan.reduce((sum, r) => sum + r.n, 0),
    plans,
    newThisWeek: created?.n ?? 0,
    suspended: suspended?.n ?? 0,
    overridesEndingSoon: ending?.n ?? 0,
  };
}

export async function accountDetail(db: Db, accountId: string) {
  const [account] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      billing: {
        plan: accountBilling.plan,
        status: accountBilling.status,
        interval: accountBilling.interval,
        customerId: accountBilling.stripeCustomerId,
        subscriptionId: accountBilling.stripeSubscriptionId,
        currentPeriodEnd: accountBilling.currentPeriodEnd,
        cancelAtPeriodEnd: accountBilling.cancelAtPeriodEnd,
      },
      override: {
        plan: planOverrides.plan,
        endsAt: planOverrides.endsAt,
        note: planOverrides.note,
        setBy: planOverrides.setBy,
        updatedAt: planOverrides.updatedAt,
      },
      suspendedAt: accountSettings.suspendedAt,
      suspendedReason: accountSettings.suspendedReason,
    })
    .from(organization)
    .leftJoin(accountBilling, eq(accountBilling.accountId, organization.id))
    .leftJoin(planOverrides, eq(planOverrides.accountId, organization.id))
    .leftJoin(accountSettings, eq(accountSettings.accountId, organization.id))
    .where(eq(organization.id, accountId))
    .limit(1);
  if (!account) throw new NotFoundError("Account not found.");

  const [
    plan,
    people,
    invites,
    spaces,
    usage,
    domain,
    [keys],
    [hooks],
    history,
  ] = await Promise.all([
    getAccountPlan(db, accountId),
    db
      .select({
        id: member.id,
        name: user.name,
        email: user.email,
        role: member.role,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, accountId))
      .orderBy(asc(member.createdAt)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, accountId),
          eq(invitation.status, "pending"),
        ),
      ),
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        createdAt: workspaces.createdAt,
      })
      .from(workspaces)
      .where(eq(workspaces.accountId, accountId))
      .orderBy(asc(workspaces.createdAt), asc(workspaces.id)),
    Promise.all(
      (["workspaces", "roadmaps", "boards"] as const).map(async (k) => [
        k,
        await countUsage(db, accountId, k),
      ]),
    ),
    db
      .select({
        hostname: customDomains.hostname,
        status: customDomains.status,
      })
      .from(customDomains)
      .where(eq(customDomains.accountId, accountId))
      .limit(1),
    db
      .select({ n: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.accountId, accountId), isNull(apiKeys.revokedAt))),
    db
      .select({ n: count() })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.accountId, accountId)),
    listAudit(db, { accountId, limit: 50 }),
  ]);
  const siteBase = await publicSiteBase(db, accountId, account.slug);
  const now = new Date();
  const override = account.override?.plan ? account.override : null;
  const overrideOn = !!override && (!override.endsAt || override.endsAt > now);
  const stripeOn =
    !!account.billing?.status && PAID.includes(account.billing.status);
  const counts = Object.fromEntries(usage) as Record<
    "workspaces" | "roadmaps" | "boards",
    number
  >;
  return {
    ...account,
    override,
    plan,
    planSource: overrideOn ? "manual" : stripeOn ? "stripe" : "free",
    /** Paying through Stripe while a manual plan is on (C6). */
    doubleBilled: overrideOn && stripeOn,
    limits: PLANS[plan].limits,
    usage: { ...counts, teammates: people.length + invites.length },
    members: people,
    invitations: invites,
    workspaces: spaces.map((w, i) => ({
      ...w,
      publicUrl: i === 0 ? siteBase : `${siteBase}/${w.slug}`,
    })),
    domain: domain[0] ?? null,
    apiKeys: keys?.n ?? 0,
    webhooks: hooks?.n ?? 0,
    history,
    billingOn: billing.enabled(),
  };
}
