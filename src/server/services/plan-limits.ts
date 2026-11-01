import { count, eq } from "drizzle-orm";
import { env } from "@/lib/env";
import {
  FEATURE_LABELS,
  type Feature,
  LIMIT_LABELS,
  type LimitKey,
  PLANS,
  type PlanId,
  planFor,
} from "@/lib/plans";
import type { Db } from "@/server/db/client";
import {
  accountBilling,
  feedbackBoards,
  roadmaps,
  type WorkspaceSettings,
  workspaces,
} from "@/server/db/schema";
import { ForbiddenError } from "./context";

/** A limit or feature the account's plan doesn't include; the UI offers an upgrade. */
export class PlanLimitError extends ForbiddenError {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

/**
 * Billing is on when Stripe is configured. Without it (dev, self-hosting)
 * every account is unlimited. An object so tests can spy on it.
 */
export const billing = {
  enabled: () => Boolean(env.STRIPE_SECRET_KEY),
};

// Stripe keeps retrying a past_due invoice; the plan stays until it gives up.
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

/** The plan the account gets right now (doc 26 §3). */
export async function getAccountPlan(
  db: Db,
  accountId: string,
): Promise<PlanId> {
  if (!billing.enabled()) return "enterprise";
  const [row] = await db
    .select({ plan: accountBilling.plan, status: accountBilling.status })
    .from(accountBilling)
    .where(eq(accountBilling.accountId, accountId))
    .limit(1);
  return row?.status && PAID_STATUSES.has(row.status) ? row.plan : "free";
}

export async function getPlanLimits(db: Db, accountId: string) {
  return PLANS[await getAccountPlan(db, accountId)].limits;
}

export async function hasFeature(db: Db, accountId: string, feature: Feature) {
  const plan = await getAccountPlan(db, accountId);
  return PLANS[plan].features.includes(feature);
}

export async function assertFeature(
  db: Db,
  accountId: string,
  feature: Feature,
) {
  if (await hasFeature(db, accountId, feature)) return;
  throw new PlanLimitError(
    `${FEATURE_LABELS[feature]} needs the ${PLANS[planFor(feature)].name} plan.`,
  );
}

const counted = {
  workspaces: { table: workspaces, accountId: workspaces.accountId },
  roadmaps: { table: roadmaps, accountId: roadmaps.accountId },
  boards: { table: feedbackBoards, accountId: feedbackBoards.accountId },
} as const;

/** How many of each counted thing the account has (per account, doc 26 P5). */
export async function countUsage(
  db: Db,
  accountId: string,
  key: keyof typeof counted,
) {
  const { table, accountId: column } = counted[key];
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(eq(column, accountId));
  return row?.n ?? 0;
}

/** Throws when creating one more `key` would go over the plan (doc 26 P6). */
export async function assertWithinLimit(
  db: Db,
  accountId: string,
  key: Exclude<LimitKey, "teammates">,
) {
  const limit = (await getPlanLimits(db, accountId))[key];
  if (limit === Infinity) return;
  if ((await countUsage(db, accountId, key)) >= limit) {
    throw new PlanLimitError(
      `Your plan allows ${limit} ${LIMIT_LABELS[key]}. Upgrade to add more.`,
    );
  }
}

/** Switches a workspace may have turned on, and the feature each needs. */
const GATED_SWITCHES = {
  commentsEnabled: "comments",
  followsEnabled: "follows",
} as const satisfies Partial<Record<keyof WorkspaceSettings, Feature>>;

/**
 * Workspace settings as the public site applies them: switches the plan
 * doesn't include are off, but stay saved for when the account upgrades
 * again (doc 26 P6).
 */
export async function gateSettings(
  db: Db,
  accountId: string,
  settings: WorkspaceSettings,
): Promise<WorkspaceSettings> {
  const plan = await getAccountPlan(db, accountId);
  const gated = { ...settings };
  for (const [key, feature] of Object.entries(GATED_SWITCHES)) {
    if (!PLANS[plan].features.includes(feature)) {
      gated[key as keyof typeof GATED_SWITCHES] = false;
    }
  }
  return gated;
}

/** Throws when `next` turns on a switch the plan doesn't include. */
export async function assertSwitchesAllowed(
  db: Db,
  accountId: string,
  current: WorkspaceSettings,
  next: Partial<WorkspaceSettings>,
) {
  for (const [key, feature] of Object.entries(GATED_SWITCHES)) {
    const k = key as keyof typeof GATED_SWITCHES;
    if (next[k] && !current[k]) await assertFeature(db, accountId, feature);
  }
}
