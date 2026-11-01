import { z } from "zod";
import { PLAN_IDS } from "@/lib/plans";
import { slugSchema, workspaceSlugSchema } from "@/lib/schemas/workspace";

// Platform admin forms (doc 28).

/** "" = no end date. */
const endDate = z.union([z.literal(""), z.iso.date()]);

export const planOverrideSchema = z.object({
  accountId: z.string().min(1),
  plan: z.enum(PLAN_IDS),
  endsOn: endDate,
  note: z.string().trim().max(500),
});

export type PlanOverrideInput = z.infer<typeof planOverrideSchema>;

export const inviteCustomerSchema = z.object({
  accountName: z.string().trim().min(2, "At least 2 characters").max(80),
  accountSlug: slugSchema,
  workspaceName: z.string().trim().min(2, "At least 2 characters").max(80),
  workspaceSlug: workspaceSlugSchema,
  ownerEmail: z.email("Enter a valid email").trim().toLowerCase(),
  /** "" = no plan override (Free, or what they buy). */
  plan: z.union([z.literal(""), z.enum(PLAN_IDS)]),
  endsOn: endDate,
  note: z.string().trim().max(500),
});

export type InviteCustomerInput = z.infer<typeof inviteCustomerSchema>;

export const suspendSchema = z.object({
  accountId: z.string().min(1),
  reason: z.string().trim().min(3, "Say why").max(300),
});
