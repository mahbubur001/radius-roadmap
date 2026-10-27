export type EmailTemplateProps = {
  "verify-email": { name: string; url: string };
  "reset-password": { name: string; url: string };
  "change-email": { name: string; newEmail: string; url: string };
  /** Voter sign-in on a public site: 6-digit code + one-click link. */
  "voter-code": { siteName: string; code: string; url: string };
  invitation: {
    inviterName: string;
    accountName: string;
    role: "owner" | "admin" | "member";
    /** Workspaces a "member" gets; empty for owners and admins (all). */
    workspaceNames: string[];
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
