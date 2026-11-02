/**
 * A tenant's branding on emails its end users get (doc 26 B4): voter codes,
 * subscriptions, posts, follow emails. Team emails never carry one.
 */
export type EmailBrand = {
  name: string;
  /** Absolute URL; null = no logo (or the plan has none). */
  logoUrl: string | null;
  /** Hex button colour; null = the default. */
  color: string | null;
  poweredBy: boolean;
};

export type EmailTemplateProps = {
  "verify-email": { name: string; url: string };
  "reset-password": { name: string; url: string };
  "change-email": { name: string; newEmail: string; url: string };
  /** Voter sign-in on a public site: 6-digit code + one-click link. */
  "voter-code": {
    siteName: string;
    code: string;
    url: string;
    brand?: EmailBrand;
  };
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
    /** New confirmed update subscribers (doc 23). */
    subscribers?: number;
    url: string;
    settingsUrl: string;
  };
  /** Double opt-in for update emails (doc 23 U1). */
  "subscribe-confirm": { siteName: string; url: string; brand?: EmailBrand };
  /** A published post, sent to update subscribers (doc 23 step 5). */
  "update-published": {
    siteName: string;
    workspaceName: string;
    title: string;
    category: { name: string; color: string } | null;
    /** Sanitized HTML of the post body, links made absolute. */
    html: string;
    coverUrl: string | null;
    url: string;
    unsubscribeUrl: string;
    brand?: EmailBrand;
  };
  /** To idea followers: its status changed (doc 23 step 6). */
  "idea-status-changed": {
    siteName: string;
    ideaTitle: string;
    status: { name: string; color: string };
    url: string;
    unfollowUrl: string;
    brand?: EmailBrand;
  };
  /** To idea followers: a published post shipped it. */
  "idea-shipped": {
    siteName: string;
    ideaTitle: string;
    postTitle: string;
    postUrl: string;
    unfollowUrl: string;
    brand?: EmailBrand;
  };
  /** To people who voted on something a published post shipped (doc 30 R4). */
  "voted-shipped": {
    siteName: string;
    itemTitle: string;
    postTitle: string;
    postUrl: string;
    optOutUrl: string;
    brand?: EmailBrand;
  };
  /** To team members following a card: it was completed (doc 24 R4). */
  "card-completed": {
    workspaceName: string;
    roadmapTitle: string;
    cardTitle: string;
    url: string;
  };
  /** Team alert: someone confirmed an update subscription. */
  "new-subscriber": {
    workspaceName: string;
    email: string;
    total: number;
    url: string;
    settingsUrl: string;
  };
  /** To account owners: Stripe couldn't charge the card (doc 26 6A). */
  "billing-payment-failed": {
    accountName: string;
    planName: string;
    url: string;
  };
  /** To account owners: the subscription ended; the account is on Free. */
  "billing-canceled": { accountName: string; planName: string; url: string };
  /** A platform admin set up an account for this person (doc 28 C3). */
  "customer-invite": {
    accountName: string;
    planName: string | null;
    endsAt: string | null;
    url: string;
  };
  /** To account owners: a granted plan ends soon (doc 28 C5). */
  "plan-override-ending": {
    accountName: string;
    planName: string;
    endsAt: string;
    url: string;
  };
  /** To account owners: a granted plan ended. */
  "plan-override-ended": {
    accountName: string;
    planName: string;
    endsAt: string;
    url: string;
  };
  /** To account owners: a webhook was switched off after failing (doc 27 A10). */
  "webhook-disabled": {
    accountName: string;
    url: string;
    reason: string;
    settingsUrl: string;
  };
  /** To account owners: their custom domain is live (doc 26 6D). */
  "domain-active": { accountName: string; hostname: string; url: string };
  /** To account owners: their custom domain stopped pointing at us. */
  "domain-failed": {
    accountName: string;
    hostname: string;
    error: string;
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
    /** Extra headers, e.g. List-Unsubscribe (RFC 2369 / 8058). */
    headers?: Record<string, string>;
  };
}[EmailTemplate];
