// Plans, limits and feature gates (doc 11, doc 26 P2/P5/P7). Shared by the
// server (enforcement) and the billing page (plan cards). Stripe prices are
// found by lookup key `<plan>_<interval>`, e.g. `pro_yearly`.

export const PLAN_IDS = ["free", "startup", "pro", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof INTERVALS)[number];

export type LimitKey = "teammates" | "workspaces" | "roadmaps" | "boards";

export type Feature =
  // Startup
  | "logo"
  | "widget"
  | "embed"
  | "comments"
  | "follows"
  | "reactions"
  // Pro
  | "whiteLabel"
  | "customFonts"
  | "customDomain"
  | "hidePoweredBy"
  | "socialSignIn"
  | "passwordProtection"
  | "webhooks"
  // Enterprise
  | "api"
  | "sso"
  | "segmentation";

export type Plan = {
  id: PlanId;
  name: string;
  /** USD per month; `year` is the per-month price when billed yearly. */
  price: { month: number; year: number };
  limits: Record<LimitKey, number>;
  features: readonly Feature[];
};

const startupFeatures: Feature[] = [
  "logo",
  "widget",
  "embed",
  "comments",
  "follows",
  "reactions",
];
const proFeatures: Feature[] = [
  ...startupFeatures,
  "whiteLabel",
  "customFonts",
  "customDomain",
  "hidePoweredBy",
  "socialSignIn",
  "passwordProtection",
  "webhooks",
];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: { month: 0, year: 0 },
    limits: { teammates: 1, workspaces: 1, roadmaps: 1, boards: 1 },
    features: [],
  },
  startup: {
    id: "startup",
    name: "Startup",
    price: { month: 12, year: 9.6 },
    limits: { teammates: 3, workspaces: 1, roadmaps: 3, boards: 3 },
    features: startupFeatures,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: { month: 24, year: 19.2 },
    limits: { teammates: 5, workspaces: 5, roadmaps: 5, boards: 5 },
    features: proFeatures,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: { month: 40, year: 32 },
    limits: {
      teammates: Infinity,
      workspaces: Infinity,
      roadmaps: Infinity,
      boards: Infinity,
    },
    features: [...proFeatures, "api", "sso", "segmentation"],
  },
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
  teammates: "teammates",
  workspaces: "workspaces",
  roadmaps: "roadmaps",
  boards: "feedback boards",
};

export const FEATURE_LABELS: Record<Feature, string> = {
  logo: "Your logo",
  widget: "Widget",
  embed: "Embeds",
  comments: "Comments",
  follows: "Following",
  reactions: "Emoji reactions",
  whiteLabel: "White-labelling",
  customFonts: "Custom fonts",
  customDomain: "Custom domain",
  hidePoweredBy: "Remove “Powered by”",
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
  return PLAN_IDS.find((id) => planIncludes(id, feature)) ?? "enterprise";
}

export function lookupKey(plan: PlanId, interval: BillingInterval) {
  return `${plan}_${interval}ly`;
}

export function parseLookupKey(
  key: string | null | undefined,
): { plan: PlanId; interval: BillingInterval } | null {
  const match = /^(startup|pro|enterprise)_(month|year)ly$/.exec(key ?? "");
  if (!match) return null;
  return {
    plan: match[1] as PlanId,
    interval: match[2] as BillingInterval,
  };
}
