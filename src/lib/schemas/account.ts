import { z } from "zod";
import { slugSchema } from "./workspace";

export const updateAccountSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80),
  slug: slugSchema,
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const switchAccountSchema = z.object({ accountId: z.string().min(1) });
