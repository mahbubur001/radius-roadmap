import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

let client: Stripe | undefined;

/** Lazily created so builds and dev work without Stripe keys. */
export function stripe() {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  client ??= new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return client;
}
