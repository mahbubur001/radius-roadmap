import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { createTransport, type Transporter } from "nodemailer";
import { render } from "react-email";
import { env } from "@/lib/env";
import { templates } from "./templates";
import type { EmailJob, EmailTemplate, EmailTemplateProps } from "./types";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
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
  return { to: job.to, subject: def.subject(job.props), html, text };
}

let smtp: Transporter | undefined;
let ses: SESv2Client | undefined;

/** Deliver an already-rendered email through the configured transport. */
export async function deliverEmail(email: OutgoingEmail) {
  switch (env.EMAIL_TRANSPORT) {
    case "console": {
      const dir = path.join(process.cwd(), ".dev-mail");
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${Date.now()}-${email.to}.json`);
      await writeFile(file, JSON.stringify({ ...email, sentAt: new Date() }));
      console.info(`[email] to=${email.to} subject="${email.subject}"`);
      console.info(email.text);
      return;
    }
    case "smtp": {
      smtp ??= createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        auth: env.SMTP_USER
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
      });
      await smtp.sendMail({ from: env.EMAIL_FROM, ...email });
      return;
    }
    case "ses": {
      ses ??= new SESv2Client({ region: env.AWS_REGION });
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: env.EMAIL_FROM,
          Destination: { ToAddresses: [email.to] },
          Content: {
            Simple: {
              Subject: { Data: email.subject },
              Body: { Html: { Data: email.html }, Text: { Data: email.text } },
            },
          },
        }),
      );
      return;
    }
  }
}
