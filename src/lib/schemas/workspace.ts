import { z } from "zod";

// Top-level app routes. Account slugs are the first path segment of public
// sites (/<account>/<workspace>), so they must not shadow these.
export const RESERVED_SLUGS = new Set([
  "api",
  "dashboard",
  "sites",
  "p",
  "onboarding",
  "sign-in",
  "sign-up",
  "check-email",
  "forgot-password",
  "reset-password",
  "accept-invite",
  "settings",
  "admin",
  "widget",
  "embed",
  "app",
  "www",
  "static",
  "_next",
  "no-access",
]);

export const LAST_WORKSPACE_COOKIE = "last_workspace";

export const slugSchema = z
  .string()
  .trim()
  .min(2, "At least 2 characters")
  .max(48, "At most 48 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes")
  .refine((s) => !RESERVED_SLUGS.has(s), "This name is reserved");

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80),
  slug: slugSchema,
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const workspaceSettingsSchema = z.object({
  requireVoterLogin: z.boolean(),
  darkModeDefault: z.boolean(),
  indexPublicPages: z.boolean(),
});

const optionalUrl = z
  .union([
    z.literal(""),
    z.url({ protocol: /^https?$/, message: "Enter a full https:// link" }),
  ])
  .transform((v) => v || null)
  .nullable();

/** Public settings → "Public site" (doc 22 step 2). */
export const publicSiteSchema = z.object({
  showRoadmap: z.boolean(),
  showIdeas: z.boolean(),
  /** Visitors comment on ideas and cards (doc 20 D3, off by default). */
  commentsEnabled: z.boolean(),
  /** Hold visitors' comments until the team approves them. */
  approveComments: z.boolean(),
  /** Visitors follow ideas (emails from Phase 4). */
  followsEnabled: z.boolean(),
  termsUrl: optionalUrl,
  privacyUrl: optionalUrl,
});

export type PublicSiteInput = z.input<typeof publicSiteSchema>;

export const updateWorkspaceSchema = createWorkspaceSchema.extend({
  settings: workspaceSettingsSchema,
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const workspaceIdSchema = z.object({ id: z.uuid() });

/** Onboarding: create the account (organization) and its first workspace. */
export const onboardingSchema = z.object({
  accountName: z.string().trim().min(2, "At least 2 characters").max(80),
  accountSlug: slugSchema,
  workspaceName: z.string().trim().min(2, "At least 2 characters").max(80),
  workspaceSlug: slugSchema,
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
