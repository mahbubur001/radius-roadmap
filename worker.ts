import { Worker } from "bullmq";
import { sendEmailJob } from "@/jobs/send-email";
import { createRedisConnection } from "@/server/queue/connection";
import { EMAIL_QUEUE } from "@/server/queue/email";

const workers = [
  new Worker(EMAIL_QUEUE, sendEmailJob, {
    connection: createRedisConnection(),
    concurrency: 5,
  }),
];

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
