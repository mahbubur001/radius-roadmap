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
  /** Team alert: a visitor suggested an idea (doc 20 step 8). */
  "new-feedback": {
    workspaceName: string;
    title: string;
    excerpt: string;
    author: string;
    /** Waiting in the triage inbox (not public yet). */
    pending: boolean;
    url: string;
    settingsUrl: string;
  };
  /** Team alert: a new comment on an idea or a card. */
  "new-comment": {
    workspaceName: string;
    targetTitle: string;
    author: string;
    excerpt: string;
    /** Waiting for approval. */
    pending: boolean;
    internal: boolean;
    url: string;
    settingsUrl: string;
  };
  /** Daily digest of new ideas and comments for one workspace. */
  "feedback-digest": {
    workspaceName: string;
    ideas: { title: string; author: string; url: string }[];
    comments: {
      target: string;
      author: string;
      excerpt: string;
      url: string;
    }[];
    url: string;
    settingsUrl: string;
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
