// Plans, limits and feature gates (doc 29: two plans). Shared by the server
// (enforcement) and the billing page (plan cards). Stripe prices are found by
// lookup key `<plan>_<interval>ly`: only `pro_monthly` and `pro_yearly`.

export const PLAN_IDS = ["free", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * Plans of doc 11 / doc 26 still possible in the database (`plan_id` enum,
 * Stripe metadata). Read as Free and Pro (doc 29 T7).
 */
export type StoredPlanId = PlanId | "startup" | "enterprise";

export function normalizePlan(plan: string | null | undefined): PlanId {
  return plan === "pro" || plan === "enterprise" ? "pro" : "free";
}

export const INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof INTERVALS)[number];

export type LimitKey = "teammates" | "workspaces" | "roadmaps" | "boards";

/**
 * Gate names used around the app. Since doc 29 only `customDomain`,
 * `uploads` and `hidePoweredBy` are Pro; the rest are on every plan. The
 * checks stay where they are, so a feature can move to Pro again later
 * without touching its code.
 */
export type Feature =
  | "logo"
  | "widget"
  | "embed"
  | "comments"
  | "follows"
  | "reactions"
  | "whiteLabel"
  | "customFonts"
  | "socialSignIn"
  | "passwordProtection"
  | "webhooks"
  | "api"
  | "sso"
  | "segmentation"
  // Pro (doc 29)
  | "customDomain"
  | "uploads"
  | "hidePoweredBy";

export type Plan = {
  id: PlanId;
  name: string;
  /** USD per month; `year` is the per-month price when billed yearly. */
  price: { month: number; year: number };
  limits: Record<LimitKey, number>;
  features: readonly Feature[];
};

const PRO_ONLY: Feature[] = ["customDomain", "uploads", "hidePoweredBy"];

const everyPlan: Feature[] = [
  "logo",
  "widget",
  "embed",
  "comments",
  "follows",
  "reactions",
  "whiteLabel",
  "customFonts",
  "socialSignIn",
  "passwordProtection",
  "webhooks",
  "api",
  "sso",
  "segmentation",
];

/** No counts are limited on either plan (doc 29 T2). */
const UNLIMITED: Record<LimitKey, number> = {
  teammates: Infinity,
  workspaces: Infinity,
  roadmaps: Infinity,
  boards: Infinity,
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: { month: 0, year: 0 },
    limits: UNLIMITED,
    features: everyPlan,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: { month: 24, year: 19.2 },
    limits: UNLIMITED,
    features: [...everyPlan, ...PRO_ONLY],
  },
};

/** What Pro adds, for the Billing page (doc 29 T9). */
export const PRO_FEATURES = PRO_ONLY;

export const LIMIT_LABELS: Record<LimitKey, string> = {
  teammates: "teammates",
  workspaces: "workspaces",
  roadmaps: "roadmaps",
  boards: "feedback boards",
};

/** "1 roadmap", "3 feedback boards", "Unlimited teammates". */
export function limitText(key: LimitKey, n: number) {
  if (n === Infinity) return `Unlimited ${LIMIT_LABELS[key]}`;
  return `${n} ${n === 1 ? LIMIT_LABELS[key].replace(/s$/, "") : LIMIT_LABELS[key]}`;
}

export const FEATURE_LABELS: Record<Feature, string> = {
  uploads: "Image and file uploads",
  logo: "Your logo",
  widget: "Widget",
  embed: "Embeds",
  comments: "Comments",
  follows: "Following",
  reactions: "Emoji reactions",
  whiteLabel: "White-labelling",
  customFonts: "Custom fonts",
  customDomain: "Custom domain",
  hidePoweredBy: "No “Powered by Radius Roadmap”",
  socialSignIn: "Social sign-in",
  passwordProtection: "Password protection",
  webhooks: "Webhooks",
  api: "API access",
  sso: "SSO",
  segmentation: "User segmentation",
};

export function planIncludes(plan: PlanId, feature: Feature) {
  return PLANS[plan].features.includes(feature);
}

/** The cheapest plan that has `feature`, for "Upgrade to …" prompts. */
export function planFor(feature: Feature): PlanId {
  return PLAN_IDS.find((id) => planIncludes(id, feature)) ?? "pro";
}

export function lookupKey(plan: "pro", interval: BillingInterval) {
  return `${plan}_${interval}ly`;
}

export function parseLookupKey(
  key: string | null | undefined,
): { plan: PlanId; interval: BillingInterval } | null {
  const match = /^(pro)_(month|year)ly$/.exec(key ?? "");
  if (!match) return null;
  return {
    plan: match[1] as PlanId,
    interval: match[2] as BillingInterval,
  };
}
