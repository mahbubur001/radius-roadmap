import { Queue } from "bullmq";
import type { EmailJob } from "@/server/email/types";
import { redis } from "./connection";

export const EMAIL_QUEUE = "email";

const globalForQueue = globalThis as typeof globalThis & {
  emailQueue?: Queue<EmailJob>;
};

export const emailQueue =
  globalForQueue.emailQueue ??
  new Queue<EmailJob>(EMAIL_QUEUE, {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });

globalForQueue.emailQueue = emailQueue;

/** Queue an email. Rendering and sending happen in the worker. */
export async function enqueueEmail(job: EmailJob) {
  await emailQueue.add(job.template, job);
}
