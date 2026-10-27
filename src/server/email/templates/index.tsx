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
};
