import type { Job } from "bullmq";
import { db } from "@/server/db/client";
import type { EmailJob } from "@/server/email/types";
import { enqueueEmail } from "@/server/queue/email";
import { type NotifyJob, notify } from "@/server/queue/notifications";
import { revalidateFromWorker } from "@/server/revalidate-from-worker";
import {
  digestEmails,
  newCommentEmails,
  newFeedbackEmails,
  newSubscriberEmails,
} from "@/server/services/notifications";
import {
  claimUpdateEmail,
  subscriberBatch,
  updateEmail,
} from "@/server/services/update-emails";
import { publishDue } from "@/server/services/update-publish";

/**
 * Fans an event out to one email job per recipient. Email job ids include
 * the event and the recipient, so a retried job never sends twice.
 */
export async function notifyJob(job: Job<NotifyJob>) {
  const data = job.data;
  let emails: { id: string; email: EmailJob }[] = [];

  if (data.type === "publish-update") {
    const post = await publishDue(db, data.updateId, new Date(data.at));
    if (post) {
      await revalidateFromWorker(post.accountId, post.workspaceId);
      await notify({ type: "send-update", updateId: post.id });
    }
    return { published: !!post };
  }

  if (data.type === "send-update") {
    // Claimed once: a retry after a crash resumes nothing twice, because
    // each email job id is post + subscriber (BullMQ ignores duplicates).
    const post = await claimUpdateEmail(db, data.updateId);
    if (!post) return { sent: 0 };
    let after: string | null = null;
    let sent = 0;
    for (;;) {
      const batch = await subscriberBatch(db, post, after);
      for (const sub of batch) {
        await enqueueEmail(updateEmail(post, sub), `post-${post.id}-${sub.id}`);
      }
      sent += batch.length;
      if (batch.length < 500) break;
      after = batch.at(-1)?.id ?? null;
    }
    return { sent };
  }

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
  } else if (data.type === "new-subscriber") {
    emails = (await newSubscriberEmails(db, data.subscriberId)).map(
      ({ userId, ...email }) => ({
        id: `ns-${data.subscriberId}-${userId}`,
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
