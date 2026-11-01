import type { Job } from "bullmq";
import { db } from "@/server/db/client";
import { enqueueEmail } from "@/server/queue/email";
import {
  DELIVERY_ATTEMPTS,
  queueDelivery,
  type WebhookJob,
} from "@/server/queue/webhooks";
import {
  createDeliveries,
  deliver,
  endpointNotice,
} from "@/server/services/webhooks";

/**
 * `emit`: one delivery per subscribed endpoint. `deliver`: send it; a
 * failure throws so BullMQ retries with backoff (doc 27 A9, A10).
 */
export async function webhookJob(job: Job<WebhookJob>) {
  const data = job.data;
  if (data.type === "emit") {
    const ids = await createDeliveries(db, data);
    for (const id of ids) await queueDelivery(id);
    return { deliveries: ids.length };
  }

  const final =
    job.attemptsMade + 1 >= (job.opts.attempts ?? DELIVERY_ATTEMPTS);
  const outcome = await deliver(db, data.deliveryId, final);
  if (outcome.result === "retry") throw new Error(outcome.error);
  if (outcome.result === "failed" && outcome.disabled) {
    const notice = await endpointNotice(db, data.deliveryId);
    for (const to of notice?.owners ?? []) {
      await enqueueEmail(
        {
          template: "webhook-disabled",
          to,
          props: {
            accountName: notice?.accountName ?? "",
            url: notice?.url ?? "",
            reason: notice?.reason ?? "",
            settingsUrl: notice?.settingsUrl ?? "",
          },
        },
        `webhook-disabled-${data.deliveryId}-${to}`,
      );
    }
  }
  return outcome;
}
