import { z } from "zod";

/** How often a team member hears about new ideas / comments (doc 20 step 8). */
export const FREQUENCIES = ["instant", "daily", "off"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  instant: "Right away",
  daily: "Daily digest",
  off: "Off",
};

export const notificationPrefsSchema = z.object({
  newFeedback: z.enum(FREQUENCIES),
  newComment: z.enum(FREQUENCIES),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
