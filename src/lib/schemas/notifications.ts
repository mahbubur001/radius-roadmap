import { z } from "zod";

/** How often a team member hears about something (doc 20 step 8, doc 33). */
export const FREQUENCIES = ["instant", "daily", "weekly", "off"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  instant: "Right away",
  daily: "Daily digest",
  weekly: "Weekly digest",
  off: "Off",
};

/** The options each alert offers (doc 33 decision 2). */
export const ALERT_OPTIONS = {
  newFeedback: FREQUENCIES,
  newComment: FREQUENCIES,
  replies: FREQUENCIES,
  /** Right away = milestone emails; Daily / Weekly = a votes section. */
  votes: FREQUENCIES,
  reviewReminder: ["daily", "weekly", "off"],
  newSubscriber: FREQUENCIES,
  /** On = "weekly". */
  weeklySummary: ["weekly", "off"],
} as const satisfies Record<string, readonly Frequency[]>;

export const notificationPrefsSchema = z.object({
  newFeedback: z.enum(ALERT_OPTIONS.newFeedback),
  newComment: z.enum(ALERT_OPTIONS.newComment),
  /** Phase 4 (doc 23): off by default for everyone. */
  newSubscriber: z.enum(ALERT_OPTIONS.newSubscriber),
  votes: z.enum(ALERT_OPTIONS.votes),
  reviewReminder: z.enum(ALERT_OPTIONS.reviewReminder),
  replies: z.enum(ALERT_OPTIONS.replies),
  weeklySummary: z.enum(ALERT_OPTIONS.weeklySummary),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
export type AlertKind = keyof NotificationPrefs;

/** Vote counts that earn a milestone email (doc 33 §2). */
export const VOTE_MILESTONES = [10, 25, 50, 100, 250, 500, 1000] as const;
