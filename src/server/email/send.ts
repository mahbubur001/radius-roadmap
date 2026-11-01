import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "@/lib/env";
import { type OutgoingEmail, renderEmail } from "./render";

// Every email goes through Amazon SES, in every environment (owner, 2026-11-01).
// Credentials come from the default AWS chain (instance role on EC2, or
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY locally).

export { type OutgoingEmail, renderEmail };

let ses: SESv2Client | undefined;

/** Deliver an already-rendered email through SES. */
export async function deliverEmail(email: OutgoingEmail) {
  ses ??= new SESv2Client({ region: env.AWS_REGION });
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: env.EMAIL_FROM,
      Destination: { ToAddresses: [email.to] },
      Content: {
        Simple: {
          Subject: { Data: email.subject },
          Body: { Html: { Data: email.html }, Text: { Data: email.text } },
          Headers: email.headers
            ? Object.entries(email.headers).map(([Name, Value]) => ({
                Name,
                Value,
              }))
            : undefined,
        },
      },
    }),
  );
}
