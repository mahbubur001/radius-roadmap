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
  invitation: {
    subject: ({ accountName }) => `You're invited to ${accountName}`,
    render: ({ inviterName, accountName, url }) => (
      <EmailLayout
        preview={`${inviterName} invited you to ${accountName}`}
        heading={`Join ${accountName}`}
        action={{ label: "Accept invitation", url }}
      >
        <Text>
          {inviterName} invited you to join <strong>{accountName}</strong> on
          Radius Roadmap.
        </Text>
      </EmailLayout>
    ),
  },
};
