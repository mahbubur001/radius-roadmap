import { z } from "zod";
import { INTERVALS } from "@/lib/plans";

export const checkoutSchema = z.object({
  plan: z.enum(["startup", "pro", "enterprise"]),
  interval: z.enum(INTERVALS),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
