import { Queue } from "bullmq";
import { redis } from "./connection";

// Team alerts (doc 20 step 8). Jobs carry ids only and are deduplicated by
// jobId, so enqueueing the same event twice sends one email.

export const NOTIFY_QUEUE = "notify";

export type NotifyJob =
  | { type: "new-feedback"; feedbackId: string }
  | { type: "new-comment"; commentId: string }
  | { type: "digest" };

const globalForQueue = globalThis as typeof globalThis & {
  notifyQueue?: Queue<NotifyJob>;
};

export const notifyQueue =
  globalForQueue.notifyQueue ??
  new Queue<NotifyJob>(NOTIFY_QUEUE, {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });

globalForQueue.notifyQueue = notifyQueue;

/**
 * Queue an alert. Never throws: a missing email must not fail the visitor's
 * request (the error is logged).
 */
export async function notify(job: Exclude<NotifyJob, { type: "digest" }>) {
  const jobId =
    job.type === "new-feedback"
      ? `new-feedback-${job.feedbackId}`
      : `new-comment-${job.commentId}`;
  try {
    await notifyQueue.add(job.type, job, { jobId });
  } catch (error) {
    console.error("[notify] enqueue failed", job, error);
  }
}
