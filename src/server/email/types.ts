export type EmailTemplateProps = {
  "verify-email": { name: string; url: string };
  "reset-password": { name: string; url: string };
  invitation: {
    inviterName: string;
    accountName: string;
    url: string;
  };
};

export type EmailTemplate = keyof EmailTemplateProps;

/** Job payload for the email queue. Must stay JSON-serialisable. */
export type EmailJob = {
  [T in EmailTemplate]: {
    template: T;
    to: string;
    props: EmailTemplateProps[T];
  };
}[EmailTemplate];
