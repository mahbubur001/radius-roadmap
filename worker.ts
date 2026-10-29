import { Worker } from "bullmq";
import { notifyJob } from "@/jobs/notify";
import { sendEmailJob } from "@/jobs/send-email";
import { createRedisConnection } from "@/server/queue/connection";
import { EMAIL_QUEUE } from "@/server/queue/email";
import { NOTIFY_QUEUE, notifyQueue } from "@/server/queue/notifications";

const workers = [
  new Worker(EMAIL_QUEUE, sendEmailJob, {
    connection: createRedisConnection(),
    concurrency: 5,
  }),
  new Worker(NOTIFY_QUEUE, notifyJob, {
    connection: createRedisConnection(),
    concurrency: 2,
  }),
];

// Daily feedback digest at 08:00 UTC (doc 20 §4.3). Upsert is idempotent.
await notifyQueue.upsertJobScheduler(
  "feedback-digest",
  { pattern: "0 0 8 * * *" },
  { name: "digest", data: { type: "digest" } },
);

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    console.error(`[worker] ${worker.name} job ${job?.id} failed:`, err);
  });
}

console.info(`[worker] started: ${workers.map((w) => w.name).join(", ")}`);

async function shutdown(signal: string) {
  console.info(`[worker] ${signal} received, closing...`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
