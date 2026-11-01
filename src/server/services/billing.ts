import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
  type BillingInterval,
  INTERVALS,
  LIMIT_LABELS,
  lookupKey,
  PLANS,
  type PlanId,
  parseLookupKey,
} from "@/lib/plans";
import type { Db, DbOrTx } from "@/server/db/client";
import { accountBilling, member, stripeEvents } from "@/server/db/schema";
import { stripe } from "@/server/stripe";
import {
  type AccountContext,
  assertRole,
  ConflictError,
  ForbiddenError,
} from "./context";
import { listInvitations } from "./invitations";
import { billing, countUsage, getAccountPlan } from "./plan-limits";

// Stripe is the source of truth: checkout and the customer portal change the
// subscription there, and webhooks mirror it into account_billing (doc 26 §3).

export async function getBillingRow(db: Db, accountId: string) {
  const [row] = await db
    .select()
    .from(accountBilling)
    .where(eq(accountBilling.accountId, accountId))
    .limit(1);
  return row ?? null;
}

/** Settings → Billing: plan, subscription state and usage against limits. */
export async function getBillingOverview(db: Db, ctx: AccountContext) {
  assertRole(ctx, "admin");
  const [plan, row, workspaces, roadmaps, boards, members, invites] =
    await Promise.all([
      getAccountPlan(db, ctx.accountId),
      getBillingRow(db, ctx.accountId),
      countUsage(db, ctx.accountId, "workspaces"),
      countUsage(db, ctx.accountId, "roadmaps"),
      countUsage(db, ctx.accountId, "boards"),
      db
        .select({ id: member.id })
        .from(member)
        .where(eq(member.organizationId, ctx.accountId)),
      listInvitations(db, ctx),
    ]);
  const used = {
    teammates: members.length + invites.length,
    workspaces,
    roadmaps,
    boards,
  };
  return {
    plan,
    interval: (row?.interval ?? null) as BillingInterval | null,
    status: row?.status ?? null,
    currentPeriodEnd: row?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    hasCustomer: !!row?.stripeCustomerId,
    usage: (Object.keys(used) as (keyof typeof used)[]).map((key) => ({
      key,
      label: LIMIT_LABELS[key],
      used: used[key],
      limit: PLANS[plan].limits[key],
    })),
  };
}

function assertBillingOwner(ctx: AccountContext) {
  if (!billing.enabled()) throw new ForbiddenError("Billing is turned off.");
  assertRole(ctx, "owner");
}

async function ensureCustomer(db: Db, ctx: AccountContext, email: string) {
  const row = await getBillingRow(db, ctx.accountId);
  if (row?.stripeCustomerId) return row.stripeCustomerId;
  const customer = await stripe().customers.create(
    { email, metadata: { accountId: ctx.accountId } },
    { idempotencyKey: `customer-${ctx.accountId}` },
  );
  await db
    .insert(accountBilling)
    .values({ accountId: ctx.accountId, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: accountBilling.accountId,
      set: { stripeCustomerId: customer.id },
    });
  return customer.id;
}

/**
 * Hosted Checkout for a new subscription (doc 26 P4). Accounts that already
 * pay change plans in the customer portal instead, so there's never a
 * second subscription.
 */
export async function startCheckout(
  db: Db,
  ctx: AccountContext,
  input: {
    plan: PlanId;
    interval: BillingInterval;
    email: string;
    returnUrl: string;
  },
) {
  assertBillingOwner(ctx);
  if (input.plan === "free" || !INTERVALS.includes(input.interval)) {
    throw new ConflictError("Choose a paid plan.");
  }
  if ((await getAccountPlan(db, ctx.accountId)) !== "free") {
    return openPortal(db, ctx, input.returnUrl);
  }
  const customer = await ensureCustomer(db, ctx, input.email);
  const key = lookupKey(input.plan, input.interval);
  const prices = await stripe().prices.list({
    lookup_keys: [key],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) throw new Error(`No Stripe price with lookup key ${key}.`);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: ctx.accountId,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: { metadata: { accountId: ctx.accountId } },
    allow_promotion_codes: true,
    success_url: `${input.returnUrl}?checkout=success`,
    cancel_url: input.returnUrl,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL.");
  return session.url;
}

/** Customer portal: change plan or interval, cancel, cards, invoices. */
export async function openPortal(
  db: Db,
  ctx: AccountContext,
  returnUrl: string,
) {
  assertBillingOwner(ctx);
  const row = await getBillingRow(db, ctx.accountId);
  if (!row?.stripeCustomerId)
    throw new ConflictError("No billing account yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

/** What we keep of a Stripe subscription. Plain data, so tests need no Stripe. */
export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  /** From the subscription's metadata (set at checkout). */
  accountId: string | null;
  status: string;
  /** Price lookup key of the first item, e.g. `pro_monthly`. */
  lookupKey: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export function toSnapshot(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items.data[0];
  return {
    id: sub.id,
    customerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    accountId: sub.metadata.accountId ?? null,
    status: sub.status,
    lookupKey: item?.price.lookup_key ?? null,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

/**
 * Mirror a subscription into account_billing. Always called with a fresh
 * copy from Stripe, so events arriving out of order can't roll it back.
 * Returns the account id, or null when the subscription isn't ours.
 */
export async function syncSubscription(db: DbOrTx, sub: SubscriptionSnapshot) {
  let accountId = sub.accountId;
  if (!accountId) {
    const [row] = await db
      .select({ accountId: accountBilling.accountId })
      .from(accountBilling)
      .where(eq(accountBilling.stripeCustomerId, sub.customerId))
      .limit(1);
    accountId = row?.accountId ?? null;
  }
  if (!accountId) return null;
  const price = parseLookupKey(sub.lookupKey);
  if (!price) {
    console.error(`[billing] unknown price lookup key ${sub.lookupKey}`);
    return null;
  }
  const values = {
    plan: price.plan,
    interval: price.interval,
    status: sub.status,
    stripeCustomerId: sub.customerId,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
  await db
    .insert(accountBilling)
    .values({ accountId, ...values })
    .onConflictDoUpdate({ target: accountBilling.accountId, set: values });
  return accountId;
}

/**
 * Apply one verified webhook event, once (doc 26 §3). `fetchSubscription`
 * returns the subscription as Stripe has it now. Returns the account whose
 * plan may have changed.
 */
export async function handleStripeEvent(
  db: Db,
  event: Pick<Stripe.Event, "id" | "type" | "data">,
  fetchSubscription: (id: string) => Promise<SubscriptionSnapshot>,
) {
  const subscriptionId = subscriptionOf(event);
  if (!subscriptionId) return null;
  const sub = await fetchSubscription(subscriptionId);
  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    if (!fresh) return null;
    return syncSubscription(tx, sub);
  });
}

function subscriptionOf(event: Pick<Stripe.Event, "type" | "data">) {
  const object = event.data.object as { id?: string; subscription?: unknown };
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return object.id ?? null;
    case "checkout.session.completed":
      return typeof object.subscription === "string"
        ? object.subscription
        : null;
    default:
      return null;
  }
}
