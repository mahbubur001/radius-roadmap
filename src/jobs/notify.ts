import type { Job } from "bullmq";
import { db } from "@/server/db/client";
import type { EmailJob } from "@/server/email/types";
import { enqueueEmail } from "@/server/queue/email";
import { type NotifyJob, notify } from "@/server/queue/notifications";
import { revalidateFromWorker } from "@/server/revalidate-from-worker";
import { getEmailBrand } from "@/server/services/branding";
import { completionSweep } from "@/server/services/card-completion-emails";
import {
  domainNotice,
  domainsDue,
  verifyDomain,
} from "@/server/services/custom-domains";
import { shippedEmails, statusSweep } from "@/server/services/follow-emails";
import {
  digestEmails,
  newCommentEmails,
  newFeedbackEmails,
  newSubscriberEmails,
} from "@/server/services/notifications";
import {
  markReminder,
  overrideReminders,
} from "@/server/services/platform/overrides";
import { ownerSuspended } from "@/server/services/platform/suspension";
import {
  claimUpdateEmail,
  subscriberBatch,
  updateEmail,
} from "@/server/services/update-emails";
import { publishDue } from "@/server/services/update-publish";
import { prefixes } from "@/server/storage/keys";
import { deletePrefix } from "@/server/storage/purge";

/**
 * Fans an event out to one email job per recipient. Email job ids include
 * the event and the recipient, so a retried job never sends twice.
 */
export async function notifyJob(job: Job<NotifyJob>) {
  const data = job.data;
  let emails: { id: string; email: EmailJob }[] = [];

  if (data.type === "delete-account-files") {
    await deletePrefix(prefixes.account(data.accountId));
    return { deleted: true };
  }

  if (data.type === "verify-domains") {
    let changed = 0;
    for (const id of await domainsDue(db)) {
      const result = await verifyDomain(db, id);
      if (!result?.changed) continue;
      changed++;
      const notice = await domainNotice(db, id);
      if (!notice) continue;
      // The site cache holds canonical URLs and links built from the domain.
      const accountId = notice.accountId;
      await revalidateFromWorker(accountId);
      for (const to of notice.owners) {
        await enqueueEmail(
          result.changed === "active"
            ? {
                template: "domain-active",
                to,
                props: {
                  accountName: notice.accountName,
                  hostname: notice.hostname,
                  url: notice.settingsUrl,
                },
              }
            : {
                template: "domain-failed",
                to,
                props: {
                  accountName: notice.accountName,
                  hostname: notice.hostname,
                  error: result.error ?? "",
                  url: notice.settingsUrl,
                },
              },
          `domain-${id}-${result.changed}-${result.checkedAt}-${to}`,
        );
      }
    }
    return { changed };
  }

  if (data.type === "plan-overrides") {
    const due = await overrideReminders(db);
    for (const r of due) {
      for (const email of r.emails) {
        await enqueueEmail(
          email,
          `override-${r.accountId}-${r.kind}-${email.to}-${new Date().toISOString().slice(0, 10)}`,
        );
      }
      await markReminder(db, r.accountId, r.kind);
    }
    return { reminders: due.length };
  }

  if (data.type === "publish-update") {
    const post = await publishDue(db, data.updateId, new Date(data.at));
    if (post) {
      await revalidateFromWorker(post.accountId, post.workspaceId);
      await notify({ type: "send-update", updateId: post.id });
      await notify({ type: "idea-shipped", updateId: post.id });
    }
    return { published: !!post };
  }

  if (data.type === "idea-status-sweep" || data.type === "idea-shipped") {
    // Suspended accounts send nothing (doc 28 C8); a later sweep catches up.
    const paused = await ownerSuspended(
      db,
      data.type === "idea-status-sweep"
        ? { workspaceId: data.workspaceId }
        : { updateId: data.updateId },
    );
    if (paused) return { sent: 0, suspended: true };
    // The sweep runs after every roadmap/feedback change (debounced), so it
    // also tells card followers about completed cards.
    const followEmails =
      data.type === "idea-status-sweep"
        ? [
            ...(await statusSweep(db, data.workspaceId)),
            ...(await completionSweep(db, data.workspaceId)),
          ]
        : await shippedEmails(db, data.updateId);
    for (const { id, email } of followEmails) await enqueueEmail(email, id);
    return { sent: followEmails.length };
  }

  if (data.type === "send-update") {
    // Claimed once: a retry after a crash resumes nothing twice, because
    // each email job id is post + subscriber (BullMQ ignores duplicates).
    // Checked before claiming, so the post isn't marked as emailed.
    if (await ownerSuspended(db, { updateId: data.updateId })) {
      return { sent: 0, suspended: true };
    }
    const post = await claimUpdateEmail(db, data.updateId);
    if (!post) return { sent: 0 };
    const brand = await getEmailBrand(db, post.accountId);
    let after: string | null = null;
    let sent = 0;
    for (;;) {
      const batch = await subscriberBatch(db, post, after);
      for (const sub of batch) {
        await enqueueEmail(
          updateEmail(post, sub, brand),
          `post-${post.id}-${sub.id}`,
        );
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
