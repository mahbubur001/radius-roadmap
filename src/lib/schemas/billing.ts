import { z } from "zod";
import { INTERVALS } from "@/lib/plans";

export const checkoutSchema = z.object({
  plan: z.literal("pro"),
  interval: z.enum(INTERVALS),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
