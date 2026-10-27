import type { Job } from "bullmq";
import { deliverEmail, renderEmail } from "@/server/email/send";
import type { EmailJob } from "@/server/email/types";

export async function sendEmailJob(job: Job<EmailJob>) {
  const email = await renderEmail(job.data);
  await deliverEmail(email);
}
