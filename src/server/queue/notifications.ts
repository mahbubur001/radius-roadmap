import { Queue } from "bullmq";
import { redis } from "./connection";

// Team alerts (doc 20 step 8). Jobs carry ids only and are deduplicated by
// jobId, so enqueueing the same event twice sends one email.

export const NOTIFY_QUEUE = "notify";

export type NotifyJob =
  | { type: "new-feedback"; feedbackId: string }
  | { type: "new-comment"; commentId: string }
  | { type: "new-subscriber"; subscriberId: string }
  | { type: "digest" }
  /** A scheduled post goes live (doc 23 U3). */
  | { type: "publish-update"; updateId: string; at: string }
  /** Email a published post to its subscribers (doc 23 step 5). */
  | { type: "send-update"; updateId: string };

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
export async function notify(
  job: Exclude<NotifyJob, { type: "digest" | "publish-update" }>,
) {
  const jobId =
    job.type === "new-feedback"
      ? `new-feedback-${job.feedbackId}`
      : job.type === "new-comment"
        ? `new-comment-${job.commentId}`
        : job.type === "new-subscriber"
          ? `new-subscriber-${job.subscriberId}`
          : `send-update-${job.updateId}`;
  try {
    await notifyQueue.add(job.type, job, { jobId });
  } catch (error) {
    console.error("[notify] enqueue failed", job, error);
  }
}

/**
 * Publish a scheduled post at `at`. The job id includes the time, so a
 * rescheduled post gets a new job and the old one finds nothing to do.
 */
export async function schedulePublish(updateId: string, at: Date) {
  await notifyQueue.add(
    "publish-update",
    { type: "publish-update", updateId, at: at.toISOString() },
    {
      jobId: `publish-update-${updateId}-${at.getTime()}`,
      delay: Math.max(0, at.getTime() - Date.now()),
    },
  );
}
