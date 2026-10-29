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
    render: ({ siteName, code, url }) => (
      <EmailLayout
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
    subject: ({ targetTitle, author }) =>
      `${author} commented on “${targetTitle}”`,
    render: ({
      workspaceName,
      targetTitle,
      author,
      excerpt,
      pending,
      internal,
      url,
      settingsUrl,
    }) => (
      <EmailLayout
        preview={excerpt}
        heading={internal ? "New internal note" : "New comment"}
        action={{ label: pending ? "Review the comment" : "Open", url }}
      >
        <Text>
          <strong>{author}</strong> commented on <strong>{targetTitle}</strong>{" "}
          in {workspaceName}:
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
    subject: ({ workspaceName, ideas, comments }) =>
      `${workspaceName}: ${count(ideas.length, "new idea")}, ${count(comments.length, "comment")}`,
    render: ({
      workspaceName,
      ideas,
      comments,
      subscribers,
      url,
      settingsUrl,
    }) => (
      <EmailLayout
        preview={`What happened in ${workspaceName} today`}
        heading={`Today in ${workspaceName}`}
        action={{ label: "Open feedback", url }}
      >
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
    ),
  },
  "subscribe-confirm": {
    subject: ({ siteName }) =>
      `Confirm your subscription to ${siteName} updates`,
    render: ({ siteName, url }) => (
      <EmailLayout
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
    }) => (
      <EmailLayout
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
};

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function Unsubscribe({ url }: { url: string }) {
  return (
    <Text style={{ color: "#888", fontSize: 12 }}>
      You get this because of your notification settings.{" "}
      <a href={url}>Change them</a>.
    </Text>
  );
}
