import type Stripe from "stripe";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { invalidateSite } from "@/server/public-cache";
import { enqueueEmail } from "@/server/queue/email";
import {
  billingNotice,
  handleStripeEvent,
  toSnapshot,
} from "@/server/services/billing";
import { stripe } from "@/server/stripe";

// Stripe → account_billing (doc 26 §3). Signature checked on the raw body;
// every event is applied once (stripe_events). A 500 makes Stripe retry.

const NOTICES = {
  "invoice.payment_failed": "billing-payment-failed",
  "customer.subscription.deleted": "billing-canceled",
} as const;

export async function POST(request: Request) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!env.STRIPE_SECRET_KEY || !secret) {
    return new Response("Billing is off.", { status: 404 });
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  const accountId = await handleStripeEvent(db, event, async (id) =>
    toSnapshot(await stripe().subscriptions.retrieve(id)),
  );
  // Plan gates change what public sites show (comments, follows…).
  if (accountId) invalidateSite(accountId);

  if (event.type in NOTICES) {
    const template = NOTICES[event.type as keyof typeof NOTICES];
    const { customer } = event.data.object as { customer?: unknown };
    const notice =
      typeof customer === "string" ? await billingNotice(db, customer) : null;
    if (notice) {
      const url = new URL(notice.billingPath, env.NEXT_PUBLIC_APP_URL).href;
      await Promise.all(
        notice.owners.map((to) =>
          enqueueEmail(
            {
              template,
              to,
              props: {
                accountName: notice.accountName,
                planName: notice.planName,
                url,
              },
            },
            `${event.id}:${to}`,
          ),
        ),
      );
    }
  }

  return Response.json({ received: true });
}
