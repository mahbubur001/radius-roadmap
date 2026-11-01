import { expect } from "@playwright/test";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { renderEmail } from "@/server/email/render";
import type { EmailJob } from "@/server/email/types";

// Email always goes out through Amazon SES, so the tests can't read an inbox.
// Instead they read the email job the app queued (BullMQ keeps jobs for a
// day) and render it with the same templates the worker uses.

type Mail = { to: string; subject: string; text: string; html: string };

let queue: Queue<EmailJob> | undefined;
function emailQueue() {
  queue ??= new Queue<EmailJob>("email", {
    connection: new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    }),
  });
  return queue;
}

/** Waits for the app to queue an email to `to` (optionally with `subject`). */
export async function waitForMail(to: string, subject?: string): Promise<Mail> {
  let mail: Mail | undefined;
  await expect
    .poll(
      async () => {
        const jobs = await emailQueue().getJobs(
          [
            "waiting",
            "active",
            "delayed",
            "completed",
            "failed",
            "prioritized",
          ],
          0,
          2000,
        );
        const mine = jobs
          .filter((j) => j?.data?.to === to)
          .sort((a, b) => b.timestamp - a.timestamp);
        for (const job of mine) {
          const m = await renderEmail(job.data);
          if (!subject || m.subject.includes(subject)) {
            mail = { to: m.to, subject: m.subject, text: m.text, html: m.html };
            return true;
          }
        }
        return false;
      },
      { timeout: 20_000, message: `no email for ${to} (${subject ?? "any"})` },
    )
    .toBe(true);
  return mail as Mail;
}

export function firstLink(text: string): string {
  const url = text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("No link in email");
  return url;
}
