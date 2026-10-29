import type { Job } from "bullmq";
import { db } from "@/server/db/client";
import type { EmailJob } from "@/server/email/types";
import { enqueueEmail } from "@/server/queue/email";
import type { NotifyJob } from "@/server/queue/notifications";
import {
  digestEmails,
  newCommentEmails,
  newFeedbackEmails,
} from "@/server/services/notifications";

/**
 * Fans an event out to one email job per recipient. Email job ids include
 * the event and the recipient, so a retried job never sends twice.
 */
export async function notifyJob(job: Job<NotifyJob>) {
  const data = job.data;
  let emails: { id: string; email: EmailJob }[] = [];

  if (data.type === "new-feedback") {
    emails = (await newFeedbackEmails(db, data.feedbackId)).map(
      ({ userId, ...email }) => ({
        id: `nf-${data.feedbackId}-${userId}`,
        email,
      }),
    );
  } else if (data.type === "new-comment") {
    emails = (await newCommentEmails(db, data.commentId)).map(
      ({ userId, ...email }) => ({
        id: `nc-${data.commentId}-${userId}`,
        email,
      }),
    );
  } else {
    // The last 24 hours; one digest per member, workspace and day.
    const day = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    emails = (await digestEmails(db, since)).map(
      ({ userId, workspaceId, ...email }) => ({
        id: `digest-${day}-${workspaceId}-${userId}`,
        email,
      }),
    );
  }

  for (const { id, email } of emails) await enqueueEmail(email, id);
  return { sent: emails.length };
}
