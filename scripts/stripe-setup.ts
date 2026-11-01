// Creates the Stripe products and prices for src/lib/plans.ts (doc 26 6A).
// Safe to run again: prices that already have their lookup key are kept.
// Usage: pnpm stripe:setup   (uses STRIPE_SECRET_KEY from .env.local)

import Stripe from "stripe";
import { INTERVALS, lookupKey, PLAN_IDS, PLANS } from "../src/lib/plans";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY in .env.local first.");
const stripe = new Stripe(key);

for (const id of PLAN_IDS.filter((p) => p !== "free")) {
  const plan = PLANS[id];
  const keys = INTERVALS.map((i) => lookupKey(id, i));
  const existing = await stripe.prices.list({ lookup_keys: keys, limit: 10 });
  const have = new Set(existing.data.map((p) => p.lookup_key));
  if (keys.every((k) => have.has(k))) {
    console.info(`${plan.name}: already set up`);
    continue;
  }

  const product =
    (
      await stripe.products.search({
        query: `metadata['plan']:'${id}'`,
        limit: 1,
      })
    ).data[0] ??
    (await stripe.products.create({
      name: `Radius Roadmap ${plan.name}`,
      metadata: { plan: id },
    }));

  for (const interval of INTERVALS) {
    const lookup = lookupKey(id, interval);
    if (have.has(lookup)) continue;
    const perMonth = plan.price[interval];
    await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: Math.round(perMonth * (interval === "year" ? 12 : 1) * 100),
      recurring: { interval },
      lookup_key: lookup,
      metadata: { plan: id },
    });
    console.info(`${plan.name}: created ${lookup}`);
  }
}
