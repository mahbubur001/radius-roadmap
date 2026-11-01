import { render } from "react-email";
import { templates } from "./templates";
import type { EmailJob, EmailTemplate, EmailTemplateProps } from "./types";

// Rendering only (no sending), so the e2e tests can render a queued email too.

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

/** Render a template to subject + HTML + plain text. */
export async function renderEmail(job: EmailJob): Promise<OutgoingEmail> {
  const def = templates[job.template] as {
    subject: (p: EmailTemplateProps[EmailTemplate]) => string;
    render: (p: EmailTemplateProps[EmailTemplate]) => React.ReactElement;
  };
  const element = def.render(job.props);
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return {
    to: job.to,
    subject: def.subject(job.props),
    html,
    text,
    headers: job.headers,
  };
}
