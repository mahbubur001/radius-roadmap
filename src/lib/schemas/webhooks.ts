import { z } from "zod";

// Outgoing webhooks (doc 27 A8): the events, and the endpoint form.

export const WEBHOOK_EVENTS = {
  Feedback: [
    "feedback.created",
    "feedback.updated",
    "feedback.deleted",
    "feedback.status_changed",
    "feedback.pushed_to_roadmap",
    "feedback.vote_added",
    "feedback.vote_removed",
  ],
  "Roadmap cards": [
    "roadmap_card.created",
    "roadmap_card.updated",
    "roadmap_card.deleted",
    "roadmap_card.completed",
    "roadmap_card.vote_added",
    "roadmap_card.vote_removed",
  ],
  Updates: ["update.published", "update.unpublished"],
  Comments: ["comment.created"],
  Subscribers: ["subscriber.added", "subscriber.removed"],
} as const;

export type WebhookEvent =
  (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS][number];

export const ALL_WEBHOOK_EVENTS = Object.values(WEBHOOK_EVENTS).flat() as [
  WebhookEvent,
  ...WebhookEvent[],
];

export const webhookEndpointSchema = z.object({
  url: z
    .url({ message: "Enter a full URL" })
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "Use an https:// URL"),
  description: z.string().trim().max(200),
  events: z.array(z.enum(ALL_WEBHOOK_EVENTS)).min(1, "Pick at least one event"),
});

export type WebhookEndpointInput = z.infer<typeof webhookEndpointSchema>;
