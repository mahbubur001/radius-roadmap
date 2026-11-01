import { Queue } from "bullmq";
import type { WebhookEvent } from "@/lib/schemas/webhooks";
import { redis } from "./connection";

// Outgoing webhooks (doc 27 A9, A11). Jobs carry ids only: `emit` builds the
// payload once and creates one delivery per endpoint; `deliver` sends one.

export const WEBHOOK_QUEUE = "webhooks";

/** Retries over about a day: 3 min, 6, 12 … about 25 h in all (A9). */
export const DELIVERY_ATTEMPTS = 9;

export type WebhookJob =
  | {
      type: "emit";
      accountId: string;
      event: WebhookEvent;
      /** The changed item (card, feedback, update, comment, subscriber). */
      entityId: string;
      /** For deleted items, the little that's left to send. */
      data?: Record<string, unknown>;
      at: string;
    }
  | { type: "deliver"; deliveryId: string };

const globalForQueue = globalThis as typeof globalThis & {
  webhookQueue?: Queue<WebhookJob>;
};

export const webhookQueue =
  globalForQueue.webhookQueue ??
  new Queue<WebhookJob>(WEBHOOK_QUEUE, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });

globalForQueue.webhookQueue = webhookQueue;

/**
 * Producer used by the services (A11). An object so tests can spy on it;
 * off in unit tests, whose rows live in another database than the worker's.
 */
export const webhookEvents = {
  enabled: () => process.env.NODE_ENV !== "test",
  async emit(
    accountId: string,
    event: WebhookEvent,
    entityId: string,
    data?: Record<string, unknown>,
  ) {
    if (!webhookEvents.enabled()) return;
    try {
      // A short delay so the write that caused it has committed.
      await webhookQueue.add(
        "emit",
        {
          type: "emit",
          accountId,
          event,
          entityId,
          data,
          at: new Date().toISOString(),
        },
        { delay: 2_000 },
      );
    } catch (error) {
      // Never let a webhook problem break the change itself.
      console.error("[webhooks] emit failed", event, error);
    }
  },
};

export const emitEvent = (
  accountId: string,
  event: WebhookEvent,
  entityId: string,
  data?: Record<string, unknown>,
) => webhookEvents.emit(accountId, event, entityId, data);

export async function queueDelivery(deliveryId: string, delay = 0) {
  await webhookQueue.add(
    "deliver",
    { type: "deliver", deliveryId },
    {
      jobId: `deliver-${deliveryId}-${Date.now()}`,
      attempts: DELIVERY_ATTEMPTS,
      backoff: { type: "exponential", delay: 180_000 },
      delay,
    },
  );
}
