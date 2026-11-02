import { z } from "zod";

/** ⌘K search across ideas, cards and articles (doc 30 step 1). */
export const quickSearchSchema = z.object({
  q: z.string().trim().min(1).max(100),
});
