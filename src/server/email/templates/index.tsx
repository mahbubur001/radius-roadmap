import type { ReactElement } from "react";
import { Text } from "react-email";
import type { EmailTemplate, EmailTemplateProps } from "../types";
import { EmailLayout } from "./layout";

type TemplateDef<T extends EmailTemplate> = {
  subject: (props: EmailTemplateProps[T]) => string;
  render: (props: EmailTemplateProps[T]) => ReactElement;
};

export const templates: { [T in EmailTemplate]: TemplateDef<T> } = {
  "verify-email": {
    subject: () => "Verify your email address",
    render: ({ name, url }) => (
      <EmailLayout
        preview="Confirm your email to finish signing up"
        heading="Verify your email"
        action={{ label: "Verify email", url }}
      >
        <Text>Hi {name},</Text>
        <Text>
          Confirm your email address to finish setting up your account.
        </Text>
      </EmailLayout>
    ),
  },
  "reset-password": {
    subject: () => "Reset your password",
    render: ({ name, url }) => (
      <EmailLayout
        preview="Reset your password"
        heading="Reset your password"
        action={{ label: "Choose a new password", url }}
      >
        <Text>Hi {name},</Text>
        <Text>
          We received a request to reset your password. If it wasn't you, you
          can ignore this email.
        </Text>
      </EmailLayout>
    ),
  },
  "change-email": {
    subject: () => "Confirm your new email address",
    render: ({ name, newEmail, url }) => (
      <EmailLayout
        preview="Confirm your new email address"
        heading="Confirm your new email"
        action={{ label: "Confirm email change", url }}
      >
        <Text>Hi {name},</Text>
        <Text>
          Confirm that you want to change your Radius Roadmap email to{" "}
          <strong>{newEmail}</strong>. If you didn't ask for this, ignore this
          email and nothing will change.
        </Text>
      </EmailLayout>
    ),
  },
  "voter-code": {
    subject: ({ code, siteName }) => `${code} is your ${siteName} sign-in code`,
    render: ({ siteName, code, url, brand }) => (
      <EmailLayout
        brand={brand}
        preview={`Your sign-in code is ${code}`}
        heading={`Sign in to ${siteName}`}
        action={{ label: "Sign in", url }}
      >
        <Text>Enter this code to sign in and vote:</Text>
        <Text style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6 }}>
          {code}
        </Text>
        <Text>
          Or use the button below. The code and link expire in 15 minutes. If
          you didn't ask for this, you can ignore this email.
        </Text>
      </EmailLayout>
    ),
  },
  invitation: {
    subject: ({ accountName }) => `You're invited to ${accountName}`,
    render: ({ inviterName, accountName, role, workspaceNames, url }) => (
      <EmailLayout
        preview={`${inviterName} invited you to ${accountName}`}
        heading={`Join ${accountName}`}
        action={{ label: "Accept invitation", url }}
      >
        <Text>
          {inviterName} invited you to join <strong>{accountName}</strong> on
          Radius Roadmap as {role === "admin" ? "an admin" : `a ${role}`}.
        </Text>
        {role === "member" && workspaceNames.length ? (
          <Text>You'll have access to: {workspaceNames.join(", ")}.</Text>
        ) : null}
        <Text>This invitation expires in 7 days.</Text>
      </EmailLayout>
    ),
  },
  "new-feedback": {
    subject: ({ workspaceName, title }) =>
      `New idea in ${workspaceName}: ${title}`,
    render: ({
      workspaceName,
      title,
      excerpt,
      author,
      pending,
      url,
      settingsUrl,
    }) => (
      <EmailLayout
        preview={`${author} suggested “${title}”`}
        heading="New idea"
        action={{
          label: pending ? "Review in the inbox" : "Open the idea",
          url,
        }}
      >
        <Text>
          <strong>{author}</strong> suggested an idea in {workspaceName}:
        </Text>
        <Text style={{ fontSize: 18, fontWeight: 600 }}>{title}</Text>
        {excerpt ? <Text style={{ color: "#555" }}>{excerpt}</Text> : null}
        {pending ? (
          <Text>
            It's waiting in the inbox and isn't public until someone approves
            it.
          </Text>
        ) : null}
        <Unsubscribe url={settingsUrl} />
      </EmailLayout>
    ),
  },
  "new-comment": {
    subject: ({ targetTitle, author, reply }) =>
      reply
        ? `${author} replied on “${targetTitle}”`
        : `${author} commented on “${targetTitle}”`,
    render: ({
      workspaceName,
      targetTitle,
      author,
      excerpt,
      pending,
      internal,
      reply,
      url,
      settingsUrl,
    }) => (
      <EmailLayout
        preview={excerpt}
        heading={
          reply ? "New reply" : internal ? "New internal note" : "New comment"
        }
        action={{ label: pending ? "Review the comment" : "Reply", url }}
      >
        <Text>
          <strong>{author}</strong>{" "}
          {reply ? "replied where you commented on" : "commented on"}{" "}
          <strong>{targetTitle}</strong> in {workspaceName}:
        </Text>
        <Text style={{ color: "#555", whiteSpace: "pre-wrap" }}>{excerpt}</Text>
        {pending ? (
          <Text>
            It's waiting for approval before it shows on your public site.
          </Text>
        ) : null}
        <Unsubscribe url={settingsUrl} />
      </EmailLayout>
    ),
  },
  "feedback-digest": {
    subject: ({
      workspaceName,
      period,
      ideas,
      comments,
      replies,
      votes,
      review,
    }) => {
      const parts = [
        ideas.length ? count(ideas.length, "new idea") : "",
        votes?.total ? count(votes.total, "vote") : "",
        comments.length + (replies?.length ?? 0)
          ? count(comments.length + (replies?.length ?? 0), "comment")
          : "",
        review?.total ? `${review.total} waiting for review` : "",
      ].filter(Boolean);
      const when = period === "weekly" ? "This week" : "Today";
      return parts.length
        ? `${workspaceName}: ${parts.join(", ")}`
        : `${when} in ${workspaceName}`;
    },
    render: ({
      workspaceName,
      period,
      ideas,
      comments,
      replies,
      subscribers,
      votes,
      review,
      summary,
      url,
      settingsUrl,
    }) => {
      const weekly = period === "weekly";
      return (
        <EmailLayout
          preview={`What happened in ${workspaceName} ${weekly ? "this week" : "today"}`}
          heading={`${weekly ? "This week" : "Today"} in ${workspaceName}`}
          action={{ label: "Open feedback", url }}
        >
          {summary ? (
            <>
              <Text style={{ fontWeight: 600 }}>The week in numbers</Text>
              <Text>
                {count(summary.ideas, "new idea")} ·{" "}
                {count(summary.votes, "vote")} ·{" "}
                {count(summary.comments, "comment")} ·{" "}
                {count(summary.subscribers, "new subscriber")} ·{" "}
                {count(summary.completed, "card")} completed ·{" "}
                {count(summary.published, "post")} published
              </Text>
            </>
          ) : null}
          {review ? (
            <>
              <Text style={{ fontWeight: 600 }}>
                {count(review.total, "idea")} waiting for review
              </Text>
              {review.items.map((i) => (
                <Text key={i.url}>
                  • <a href={i.url}>{i.title}</a> ({count(i.days, "day")})
                </Text>
              ))}
              {review.total > review.items.length ? (
                <Text>
                  <a href={review.url}>
                    And {review.total - review.items.length} more in the inbox
                  </a>
                </Text>
              ) : null}
            </>
          ) : null}
          {ideas.length ? (
            <>
              <Text style={{ fontWeight: 600 }}>
                {count(ideas.length, "new idea")}
              </Text>
              {ideas.map((i) => (
                <Text key={i.url}>
                  • <a href={i.url}>{i.title}</a> by {i.author}
                </Text>
              ))}
            </>
          ) : null}
          {votes ? (
            <>
              <Text style={{ fontWeight: 600 }}>
                {count(votes.total, "new vote")}
              </Text>
              {votes.top.map((t) => (
                <Text key={t.url}>
                  • <a href={t.url}>{t.title}</a> +{t.votes}
                </Text>
              ))}
              {votes.milestones.map((m) => (
                <Text key={`${m.url}-${m.milestone}`}>
                  🎯 <a href={m.url}>{m.title}</a> reached {m.milestone} votes
                </Text>
              ))}
            </>
          ) : null}
          {replies?.length ? (
            <>
              <Text style={{ fontWeight: 600 }}>
                {count(replies.length, "reply", "replies")} to you
              </Text>
              {replies.map((c) => (
                <Text key={c.url + c.excerpt}>
                  • {c.author} on <a href={c.url}>{c.target}</a>: {c.excerpt}
                </Text>
              ))}
            </>
          ) : null}
          {comments.length ? (
            <>
              <Text style={{ fontWeight: 600 }}>
                {count(comments.length, "new comment")}
              </Text>
              {comments.map((c) => (
                <Text key={c.url + c.excerpt}>
                  • {c.author} on <a href={c.url}>{c.target}</a>: {c.excerpt}
                </Text>
              ))}
            </>
          ) : null}
          {subscribers ? (
            <Text style={{ fontWeight: 600 }}>
              {count(subscribers, "new update subscriber")}
            </Text>
          ) : null}
          <Unsubscribe url={settingsUrl} />
        </EmailLayout>
      );
    },
  },
  "subscribe-confirm": {
    subject: ({ siteName }) =>
      `Confirm your subscription to ${siteName} updates`,
    render: ({ siteName, url, brand }) => (
      <EmailLayout
        brand={brand}
        preview={`Confirm to get ${siteName} updates by email`}
        heading="Confirm your subscription"
        action={{ label: "Yes, send me updates", url }}
      >
        <Text>
          Someone (hopefully you) asked to get <strong>{siteName}</strong>{" "}
          updates by email. Confirm with the button below.
        </Text>
        <Text style={{ color: "#888", fontSize: 12 }}>
          If it wasn't you, ignore this email: you won't hear from us.
        </Text>
      </EmailLayout>
    ),
  },
  "update-published": {
    subject: ({ workspaceName, title }) => `${workspaceName}: ${title}`,
    render: ({
      siteName,
      workspaceName,
      title,
      category,
      html,
      coverUrl,
      url,
      unsubscribeUrl,
      brand,
    }) => (
      <EmailLayout
        brand={brand}
        preview={`New from ${workspaceName}: ${title}`}
        heading={title}
        action={{ label: "Read on the site", url }}
      >
        {category ? (
          <Text style={{ margin: "0 0 8px", fontSize: 13, color: "#555" }}>
            <span style={{ color: category.color }}>●</span> {category.name}
          </Text>
        ) : null}
        {coverUrl ? (
          // biome-ignore lint/performance/noImgElement: email markup
          <img
            src={coverUrl}
            alt=""
            width="416"
            style={{ width: "100%", borderRadius: 8, margin: "8px 0 16px" }}
          />
        ) : null}
        <div
          style={{ fontSize: 15, lineHeight: 1.6, color: "#18181b" }}
          // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <Text style={{ color: "#888", fontSize: 12 }}>
          You subscribed to {siteName} updates.{" "}
          <a href={unsubscribeUrl}>Unsubscribe</a>.
        </Text>
      </EmailLayout>
    ),
  },
  "idea-status-changed": {
    subject: ({ ideaTitle, status }) => `“${ideaTitle}” is now ${status.name}`,
    render: ({ siteName, ideaTitle, status, url, unfollowUrl, brand }) => (
      <EmailLayout
        brand={brand}
        preview={`An idea you follow is now ${status.name}`}
        heading="An idea you follow moved"
        action={{ label: "See the idea", url }}
      >
        <Text>
          <strong>{ideaTitle}</strong> on {siteName} is now{" "}
          <span style={{ color: status.color, fontWeight: 600 }}>
            {status.name}
          </span>
          .
        </Text>
        <FollowFooter siteName={siteName} url={unfollowUrl} />
      </EmailLayout>
    ),
  },
  "idea-shipped": {
    subject: ({ ideaTitle }) => `Shipped: ${ideaTitle}`,
    render: ({
      siteName,
      ideaTitle,
      postTitle,
      postUrl,
      unfollowUrl,
      brand,
    }) => (
      <EmailLayout
        brand={brand}
        preview={`${ideaTitle} has shipped`}
        heading="An idea you follow shipped"
        action={{ label: "Read the update", url: postUrl }}
      >
        <Text>
          Good news: <strong>{ideaTitle}</strong> is live. {siteName} wrote
          about it in “{postTitle}”.
        </Text>
        <FollowFooter siteName={siteName} url={unfollowUrl} />
      </EmailLayout>
    ),
  },
  "voted-shipped": {
    subject: ({ itemTitle }) => `It's live: ${itemTitle}`,
    render: ({ siteName, itemTitle, postTitle, postUrl, optOutUrl, brand }) => (
      <EmailLayout
        brand={brand}
        preview={`${itemTitle} is live`}
        heading="Something you voted for shipped"
        action={{ label: "Read the update", url: postUrl }}
      >
        <Text>
          You voted for <strong>{itemTitle}</strong>, and it&apos;s live now.{" "}
          {siteName} wrote about it in “{postTitle}”. Thanks for telling them
          what you needed.
        </Text>
        <Text style={{ color: "#888", fontSize: 12 }}>
          You get this because you voted on {siteName}.{" "}
          <a href={optOutUrl}>Stop these emails</a>.
        </Text>
      </EmailLayout>
    ),
  },
  "card-completed": {
    subject: ({ cardTitle }) => `Completed: ${cardTitle}`,
    render: ({ workspaceName, roadmapTitle, cardTitle, url }) => (
      <EmailLayout
        preview={`${cardTitle} is done`}
        heading="A card you follow is done"
        action={{ label: "Open the card", url }}
      >
        <Text>
          <strong>{cardTitle}</strong> was completed on the {roadmapTitle}{" "}
          roadmap of {workspaceName}.
        </Text>
        <Text style={{ color: "#888", fontSize: 12 }}>
          You follow this card. Open it and choose Unfollow to stop these
          emails.
        </Text>
      </EmailLayout>
    ),
  },
  "new-subscriber": {
    subject: ({ workspaceName, email }) =>
      `${email} subscribed to ${workspaceName} updates`,
    render: ({ workspaceName, email, total, url, settingsUrl }) => (
      <EmailLayout
        preview={`${count(total, "subscriber")} now`}
        heading="New subscriber"
        action={{ label: "See subscribers", url }}
      >
        <Text>
          <strong>{email}</strong> subscribed to {workspaceName} updates. You
          now have {count(total, "subscriber")}.
        </Text>
        <Unsubscribe url={settingsUrl} />
      </EmailLayout>
    ),
  },
  "vote-milestone": {
    subject: ({ title, milestone }) => `“${title}” reached ${milestone} votes`,
    render: ({ workspaceName, kind, title, milestone, url, settingsUrl }) => (
      <EmailLayout
        preview={`${milestone} people want this`}
        heading={`${milestone} votes`}
        action={{
          label: kind === "card" ? "Open the card" : "Open the idea",
          url,
        }}
      >
        <Text>
          The {kind === "card" ? "roadmap card" : "idea"}{" "}
          <strong>{title}</strong> in {workspaceName} just reached{" "}
          <strong>{milestone} votes</strong>.
        </Text>
        <Unsubscribe url={settingsUrl} />
      </EmailLayout>
    ),
  },
  "billing-payment-failed": {
    subject: ({ accountName }) =>
      `${accountName}: your payment didn't go through`,
    render: ({ accountName, planName, url }) => (
      <EmailLayout
        preview="Update your card to keep your plan"
        heading="Your payment didn't go through"
        action={{ label: "Update payment details", url }}
      >
        <Text>
          We couldn't charge the card for <strong>{accountName}</strong>'s{" "}
          {planName} plan. We'll try again over the next few days. Update your
          payment details to keep the plan.
        </Text>
      </EmailLayout>
    ),
  },
  "billing-canceled": {
    subject: ({ accountName }) => `${accountName}: your subscription has ended`,
    render: ({ accountName, planName, url }) => (
      <EmailLayout
        preview="Your account is now on the Free plan"
        heading="Your subscription has ended"
        action={{ label: "See plans", url }}
      >
        <Text>
          <strong>{accountName}</strong>'s {planName} plan has ended and the
          account is now on the Free plan. Nothing was deleted: upgrade again
          any time to turn paid features back on.
        </Text>
      </EmailLayout>
    ),
  },
  "customer-invite": {
    subject: ({ accountName }) =>
      `Your Radius Roadmap account “${accountName}” is ready`,
    render: ({ accountName, planName, endsAt, url }) => (
      <EmailLayout
        preview="Accept the invitation to start"
        heading="Your account is ready"
        action={{ label: "Accept and sign in", url }}
      >
        <Text>
          We've set up <strong>{accountName}</strong> on Radius Roadmap for you,
          with you as the owner.
          {planName
            ? ` It's on the ${planName} plan${endsAt ? ` until ${day(endsAt)}` : ""}.`
            : ""}
        </Text>
        <Text>
          Accept with the button below: you can create your login or use an
          existing one. The invitation expires in 14 days.
        </Text>
      </EmailLayout>
    ),
  },
  "plan-override-ending": {
    subject: ({ planName, endsAt }) =>
      `Your ${planName} plan ends on ${day(endsAt)}`,
    render: ({ accountName, planName, endsAt, url }) => (
      <EmailLayout
        preview={`${accountName}'s ${planName} plan ends soon`}
        heading={`Your ${planName} plan ends soon`}
        action={{ label: "See plans", url }}
      >
        <Text>
          <strong>{accountName}</strong> has the {planName} plan until{" "}
          {day(endsAt)}. After that it moves to your paid plan, or to Free.
          Nothing is deleted.
        </Text>
      </EmailLayout>
    ),
  },
  "plan-override-ended": {
    subject: ({ planName }) => `Your ${planName} plan has ended`,
    render: ({ accountName, planName, url }) => (
      <EmailLayout
        preview={`${accountName}'s ${planName} plan has ended`}
        heading={`Your ${planName} plan has ended`}
        action={{ label: "Choose a plan", url }}
      >
        <Text>
          <strong>{accountName}</strong>'s {planName} plan has ended. Your data
          is all still there; upgrade any time to switch paid features back on.
        </Text>
      </EmailLayout>
    ),
  },
  "webhook-disabled": {
    subject: () => "A webhook was switched off",
    render: ({ accountName, url, reason, settingsUrl }) => (
      <EmailLayout
        preview={`Deliveries to ${url} kept failing`}
        heading="A webhook was switched off"
        action={{ label: "Webhook settings", url: settingsUrl }}
      >
        <Text>
          Deliveries from <strong>{accountName}</strong> to <code>{url}</code>{" "}
          failed for three days. {reason}
        </Text>
        <Text>
          Fix the receiving end, then switch the webhook back on. Missed events
          can be sent again from the delivery log.
        </Text>
      </EmailLayout>
    ),
  },
  "domain-active": {
    subject: ({ hostname }) => `${hostname} is live`,
    render: ({ accountName, hostname, url }) => (
      <EmailLayout
        preview={`Your public site now lives at ${hostname}`}
        heading="Your domain is live"
        action={{ label: "Domain settings", url }}
      >
        <Text>
          <strong>{accountName}</strong>'s public site now lives at{" "}
          <strong>{hostname}</strong>. Links to the old address redirect there.
        </Text>
      </EmailLayout>
    ),
  },
  "domain-failed": {
    subject: ({ hostname }) => `${hostname} stopped working`,
    render: ({ accountName, hostname, error, url }) => (
      <EmailLayout
        preview={`Check the DNS records for ${hostname}`}
        heading="Your domain stopped working"
        action={{ label: "Check the DNS records", url }}
      >
        <Text>
          We couldn't reach <strong>{hostname}</strong> for {accountName} for
          three days in a row: {error} Your public site is back on its Radius
          Roadmap address until the DNS records are fixed.
        </Text>
      </EmailLayout>
    ),
  },
};

/** "1 March 2027" from an ISO date-time (UTC). */
function day(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function count(n: number, noun: string, plural = `${noun}s`) {
  return `${n} ${n === 1 ? noun : plural}`;
}

function FollowFooter({ siteName, url }: { siteName: string; url: string }) {
  return (
    <Text style={{ color: "#888", fontSize: 12 }}>
      You follow this idea on {siteName}. <a href={url}>Stop following it</a>.
    </Text>
  );
}

function Unsubscribe({ url }: { url: string }) {
  return (
    <Text style={{ color: "#888", fontSize: 12 }}>
      You get this because of your notification settings.{" "}
      <a href={url}>Change them</a>.
    </Text>
  );
}
