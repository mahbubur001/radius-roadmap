import { Worker } from "bullmq";
import { notifyJob } from "@/jobs/notify";
import { sendEmailJob } from "@/jobs/send-email";
import { webhookJob } from "@/jobs/webhooks";
import { createRedisConnection } from "@/server/queue/connection";
import { EMAIL_QUEUE } from "@/server/queue/email";
import { NOTIFY_QUEUE, notifyQueue } from "@/server/queue/notifications";
import { WEBHOOK_QUEUE } from "@/server/queue/webhooks";

const workers = [
  new Worker(EMAIL_QUEUE, sendEmailJob, {
    connection: createRedisConnection(),
    concurrency: 5,
    // Stay under Amazon SES's default sending rate (14 emails a second).
    limiter: { max: 12, duration: 1000 },
  }),
  new Worker(NOTIFY_QUEUE, notifyJob, {
    connection: createRedisConnection(),
    concurrency: 2,
  }),
  // Outgoing webhooks (doc 27): slow receivers mustn't hold up the rest.
  new Worker(WEBHOOK_QUEUE, webhookJob, {
    connection: createRedisConnection(),
    concurrency: 10,
  }),
];

// Daily feedback digest at 08:00 UTC (doc 20 §4.3). Upsert is idempotent.
await notifyQueue.upsertJobScheduler(
  "feedback-digest",
  { pattern: "0 0 8 * * *" },
  { name: "digest", data: { type: "digest" } },
);

// Custom domain DNS checks (doc 26 D4): pending ones, and active ones daily.
await notifyQueue.upsertJobScheduler(
  "verify-domains",
  { every: 10 * 60 * 1000 },
  { name: "verify-domains", data: { type: "verify-domains" } },
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
